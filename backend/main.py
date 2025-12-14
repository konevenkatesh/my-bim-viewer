# backend/main.py
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import ifcopenshell
import ifcopenshell.util.element as element_util
from typing import Optional, Dict, Any
import os
import tempfile
import uuid

app = FastAPI(title="BIM IFC API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store loaded IFC files in memory (in production, use Redis or database)
ifc_files = {}

class GUIDRequest(BaseModel):
    model_id: str
    guid: str

class ElementResponse(BaseModel):
    guid: str
    name: Optional[str]
    type: str
    properties: Dict[str, Any]
    psets: Dict[str, Dict[str, Any]]

@app.post("/upload-ifc")
async def upload_ifc(file: UploadFile = File(...)):
    """
    Upload and store IFC file for processing
    Returns a model_id to reference this file
    """
    try:
        # Generate unique model ID
        model_id = str(uuid.uuid4())
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".ifc") as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        # Load IFC file with ifcopenshell
        ifc_file = ifcopenshell.open(tmp_path)
        
        # Store in memory
        ifc_files[model_id] = {
            "file": ifc_file,
            "path": tmp_path,
            "filename": file.filename
        }
        
        # Get basic info
        project = ifc_file.by_type("IfcProject")[0] if ifc_file.by_type("IfcProject") else None
        
        return {
            "model_id": model_id,
            "filename": file.filename,
            "project_name": project.Name if project else "Unknown",
            "total_elements": len(ifc_file.by_type("IfcProduct")),
            "message": "IFC file uploaded successfully"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing IFC: {str(e)}")

@app.post("/get-element-by-guid", response_model=ElementResponse)
async def get_element_by_guid(request: GUIDRequest):
    """
    Get element details by GUID from a specific model
    """
    if request.model_id not in ifc_files:
        raise HTTPException(status_code=404, detail="Model not found")
    
    try:
        ifc_file = ifc_files[request.model_id]["file"]
        
        # Get element by GUID
        element = ifc_file.by_guid(request.guid)
        
        if not element:
            raise HTTPException(status_code=404, detail=f"Element with GUID {request.guid} not found")
        
        # Extract basic properties
        element_data = {
            "guid": element.GlobalId,
            "name": element.Name if hasattr(element, 'Name') else None,
            "type": element.is_a(),
            "properties": {},
            "psets": {}
        }
        
        # Get all properties
        try:
            element_data["properties"] = {
                "ObjectType": element.ObjectType if hasattr(element, 'ObjectType') else None,
                "Tag": element.Tag if hasattr(element, 'Tag') else None,
                "Description": element.Description if hasattr(element, 'Description') else None,
            }
        except:
            pass
        
        # Get Property Sets (Psets)
        try:
            psets = ifcopenshell.util.element.get_psets(element)
            element_data["psets"] = psets
        except Exception as e:
            print(f"Error getting psets: {e}")
        
        # Get quantities
        try:
            quantities = {}
            for rel in element.IsDefinedBy:
                if rel.is_a('IfcRelDefinesByProperties'):
                    prop_def = rel.RelatingPropertyDefinition
                    if prop_def.is_a('IfcElementQuantity'):
                        for quantity in prop_def.Quantities:
                            if hasattr(quantity, 'LengthValue'):
                                quantities[quantity.Name] = {
                                    "value": quantity.LengthValue,
                                    "unit": "m"
                                }
                            elif hasattr(quantity, 'AreaValue'):
                                quantities[quantity.Name] = {
                                    "value": quantity.AreaValue,
                                    "unit": "m²"
                                }
                            elif hasattr(quantity, 'VolumeValue'):
                                quantities[quantity.Name] = {
                                    "value": quantity.VolumeValue,
                                    "unit": "m³"
                                }
            
            if quantities:
                element_data["psets"]["Quantities"] = quantities
                
        except Exception as e:
            print(f"Error getting quantities: {e}")
        
        return element_data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving element: {str(e)}")

@app.delete("/remove-model/{model_id}")
async def remove_model(model_id: str):
    """
    Remove a model from memory and delete temporary file
    """
    if model_id not in ifc_files:
        raise HTTPException(status_code=404, detail="Model not found")
    
    try:
        # Delete temporary file
        tmp_path = ifc_files[model_id]["path"]
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        
        # Remove from memory
        del ifc_files[model_id]
        
        return {"message": "Model removed successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing model: {str(e)}")

@app.get("/models")
async def list_models():
    """
    List all loaded models
    """
    models = []
    for model_id, data in ifc_files.items():
        models.append({
            "model_id": model_id,
            "filename": data["filename"]
        })
    return {"models": models}

@app.get("/")
async def root():
    return {
        "message": "BIM IFC API Server",
        "endpoints": {
            "POST /upload-ifc": "Upload IFC file",
            "POST /get-element-by-guid": "Get element details by GUID",
            "DELETE /remove-model/{model_id}": "Remove model",
            "GET /models": "List loaded models"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)