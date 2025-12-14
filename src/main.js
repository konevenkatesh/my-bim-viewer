// src/main.js - Frontend with FastAPI Integration
import * as THREE from "three";
import Stats from "stats.js";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as BUI from "@thatopen/ui";

// ========================================
// CONFIGURATION
// ========================================
const API_BASE_URL = "http://localhost:8000"; // Change this to your backend URL

// ========================================
// 1. Setup Container and Components
// ========================================
const container = document.getElementById("container");
const components = new OBC.Components();

// ========================================
// 2. Setup World
// ========================================
const worlds = components.get(OBC.Worlds);
const world = worlds.create();
world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = new THREE.Color(0x2a2a2a);
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.SimpleCamera(components);
world.camera.controls.setLookAt(50, 30, 50, 0, 0, 0);
components.init();

const grids = components.get(OBC.Grids);
grids.create(world);

// ========================================
// 3. Setup Fragment Manager
// ========================================
const workerUrl = new URL("/worker.mjs", import.meta.url).href;
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

world.camera.controls.addEventListener("rest", () =>
  fragments.core.update(true)
);

world.onCameraChanged.add((camera) => {
  for (const [, model] of fragments.list) {
    model.useCamera(camera.three);
  }
  fragments.core.update(true);
});

fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  fragments.core.update(true);
});

// ========================================
// 4. IFC Conversion Setup
// ========================================
const serializer = new FRAGS.IfcImporter();
serializer.wasm = { 
  absolute: true, 
  path: "https://unpkg.com/web-ifc@0.0.72/" 
};

// Track loaded models with backend model_id
const loadedModels = new Map(); // frontendId -> { backendModelId, name, timestamp, file }

// ========================================
// 5. API Functions
// ========================================

/**
 * Upload IFC to backend and get model_id
 */
async function uploadIFCToBackend(file) {
  const formData = new FormData();
  formData.append("file", file);
  
  const response = await fetch(`${API_BASE_URL}/upload-ifc`, {
    method: "POST",
    body: formData
  });
  
  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Get element details from backend by GUID
 */
async function getElementByGUID(backendModelId, guid) {
  const response = await fetch(`${API_BASE_URL}/get-element-by-guid`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model_id: backendModelId,
      guid: guid
    })
  });
  
  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Remove model from backend
 */
async function removeModelFromBackend(backendModelId) {
  const response = await fetch(`${API_BASE_URL}/remove-model/${backendModelId}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }

  return await response.json();
}

// ========================================
// 6. Load Local IFC File
// ========================================
const loadLocalIFC = async (file) => {
  try {
    // Step 1: Upload to backend
    console.log("📤 Uploading IFC to backend...");
    const backendResponse = await uploadIFCToBackend(file);
    console.log("✅ Backend uploaded:", backendResponse);
    
    // Step 2: Convert IFC to Fragments for 3D viewer
    console.log("🔄 Converting IFC to Fragments...");
    const buffer = await file.arrayBuffer();
    const ifcBytes = new Uint8Array(buffer);
    
    const fragmentBytes = await serializer.process({
      bytes: ifcBytes,
      progressCallback: (progress) => {
        console.log(`Progress: ${(progress * 100).toFixed(1)}%`);
      },
    });
    
    // Step 3: Load fragments into scene
    const frontendModelId = `${file.name.split(".")[0]}_${Date.now()}`;
    const model = await fragments.core.load(fragmentBytes, {
      modelId: frontendModelId
    });

    // Step 4: Store both IDs
    loadedModels.set(frontendModelId, {
      backendModelId: backendResponse.model_id,
      name: file.name,
      timestamp: new Date().toLocaleString(),
      file: file,
      projectName: backendResponse.project_name,
      totalElements: backendResponse.total_elements
    });

    console.log("✅ Model loaded successfully");

    return { model, frontendModelId };
    
  } catch (error) {
    console.error("❌ Error loading IFC:", error);
    throw error;
  }
};

// ========================================
// 7. Setup Raycaster with Backend Integration
// ========================================
const casters = components.get(OBC.Raycasters);
const caster = casters.get(world);

let selectedElementData = null;
let lastSelectedModelIdMap = null;
let isLoadingElement = false;
const highlightColor = new THREE.Color("gold");

// Track mouse for drag detection
let mouseDownPosition = { x: 0, y: 0 };
let isMouseDown = false;

container.addEventListener("mousedown", (event) => {
  isMouseDown = true;
  mouseDownPosition = { x: event.clientX, y: event.clientY };
});

container.addEventListener("mousemove", (event) => {
  if (isMouseDown) {
    const deltaX = Math.abs(event.clientX - mouseDownPosition.x);
    const deltaY = Math.abs(event.clientY - mouseDownPosition.y);
    
    if (deltaX > 5 || deltaY > 5) {
      isMouseDown = false;
    }
  }
});

container.addEventListener("mouseup", async (event) => {
  if (!isMouseDown) return;
  isMouseDown = false;
  
  if (event.button !== 0) return;
  
  // Clear previous selection
  if (lastSelectedModelIdMap) {
    await fragments.resetHighlight();
  }
  
  const result = await caster.castRay();
  
  if (!result) {
    lastSelectedModelIdMap = null;
    selectedElementData = null;
    updatePanel();
    return;
  }
  
  const modelIdMap = { 
    [result.fragments.modelId]: new Set([result.localId]) 
  };
  
  lastSelectedModelIdMap = modelIdMap;
  
  // Get local element data for GUID
  const model = fragments.list.get(result.fragments.modelId);
  if (model) {
    const [localData] = await model.getItemsData([result.localId]);
    
    // Find backend model ID
    const modelInfo = Array.from(loadedModels.entries())
      .find(([frontendId]) => frontendId === result.fragments.modelId);
    
    if (modelInfo && localData._guid?.value) {
      const backendModelId = modelInfo[1].backendModelId;
      const guid = localData._guid.value;
      
      console.log("🎯 Selected element GUID:", guid);
      
      // Fetch detailed data from backend
      isLoadingElement = true;
      updatePanel();
      
      try {
        const backendData = await getElementByGUID(backendModelId, guid);
        console.log("📋 Backend element data:", backendData);
        
        selectedElementData = {
          ...backendData,
          localData: localData
        };
        
      } catch (error) {
        console.error("❌ Error fetching element from backend:", error);
        selectedElementData = { 
          error: error.message,
          localData: localData 
        };
      }
      
      isLoadingElement = false;
    }
  }
  
  // Highlight element
  await fragments.highlight(
    {
      color: highlightColor,
      renderedFaces: FRAGS.RenderedFaces.TWO,
      opacity: 1,
      transparent: false,
    },
    modelIdMap
  );
  
  await fragments.core.update(true);
  updatePanel();
});

// ========================================
// 8. UI Panel with Backend Data
// ========================================
BUI.Manager.init();

const [panel, updatePanel] = BUI.Component.create((_) => {
  const onFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.disabled = true;
    try {
      await loadLocalIFC(file);
      updatePanel();
    } catch (error) {
      console.error("Error loading IFC:", error);
      alert(`Failed to load IFC file: ${error.message}`);
    }
    event.target.disabled = false;
    event.target.value = '';
  };

  const onRemoveModel = async (frontendModelId) => {
    const modelInfo = loadedModels.get(frontendModelId);

    if (modelInfo) {
      // Remove from backend
      try {
        await removeModelFromBackend(modelInfo.backendModelId);
        console.log("✅ Removed from backend");
      } catch (error) {
        console.error("⚠️ Error removing from backend:", error);
      }
    }

    // Remove from frontend
    const model = fragments.list.get(frontendModelId);
    if (model) {
      world.scene.three.remove(model.object);
      fragments.list.delete(frontendModelId);
      model.dispose();
    }

    loadedModels.delete(frontendModelId);

    if (lastSelectedModelIdMap && lastSelectedModelIdMap[frontendModelId]) {
      await fragments.resetHighlight();
      lastSelectedModelIdMap = null;
      selectedElementData = null;
    }

    await fragments.core.update(true);
    updatePanel();
  };

  // Build models list
  const modelsList = Array.from(loadedModels.entries()).map(([frontendId, info]) => {
    return BUI.html`
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #333; border-radius: 4px; margin-bottom: 8px;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${info.name}
          </div>
          <div style="font-size: 0.7rem; color: #888;">
            ${info.projectName} • ${info.totalElements} elements
          </div>
          <div style="font-size: 0.65rem; color: #666;">
            ${info.timestamp}
          </div>
        </div>
        <bim-button 
          style="margin-left: 8px;"
          label="Remove" 
          @click=${() => onRemoveModel(frontendId)}>
        </bim-button>
      </div>
    `;
  });

  // Build properties display from backend data
  let propertiesContent;
  
  if (isLoadingElement) {
    propertiesContent = BUI.html`
      <div style="text-align: center; padding: 20px;">
        <bim-label>Loading element data from backend...</bim-label>
      </div>
    `;
  } else if (!selectedElementData) {
    propertiesContent = BUI.html`
      <bim-label>No element selected. Click an element to view properties from backend.</bim-label>
    `;
  } else if (selectedElementData.error) {
    propertiesContent = BUI.html`
      <div style="padding: 8px; background: #ffcccc; color: #cc0000; border-radius: 4px;">
        <bim-label>Error: ${selectedElementData.error}</bim-label>
      </div>
    `;
  } else {
    const basicProps = BUI.html`
      <div style="margin-bottom: 12px;">
        <div style="font-weight: bold; color: #4ade80; margin-bottom: 8px;">Basic Info (from Backend)</div>
        <div style="padding: 4px 0; border-bottom: 1px solid #333;">
          <span style="color: #888;">Name:</span>
          <span style="font-weight: 500; float: right;">${selectedElementData.name || 'N/A'}</span>
        </div>
        <div style="padding: 4px 0; border-bottom: 1px solid #333;">
          <span style="color: #888;">Type:</span>
          <span style="font-weight: 500; float: right;">${selectedElementData.type}</span>
        </div>
        <div style="padding: 4px 0; border-bottom: 1px solid #333;">
          <span style="color: #888;">GUID:</span>
          <span style="font-weight: 500; font-size: 0.75rem; float: right;">${selectedElementData.guid}</span>
        </div>
      </div>
    `;
    
    // Display Property Sets
    const psetElements = Object.entries(selectedElementData.psets || {}).map(([psetName, props]) => {
      const propItems = Object.entries(props).map(([key, value]) => {
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return BUI.html`
          <div style="padding: 4px 0; border-bottom: 1px solid #444;">
            <span style="color: #888; font-size: 0.85rem;">${key}:</span>
            <span style="font-weight: 500; font-size: 0.85rem; float: right; max-width: 60%; word-break: break-word;">${displayValue}</span>
          </div>
        `;
      });
      
      return BUI.html`
        <div style="margin-bottom: 12px;">
          <div style="font-weight: bold; color: #60a5fa; margin-bottom: 8px;">${psetName}</div>
          ${propItems}
        </div>
      `;
    });
    
    propertiesContent = BUI.html`
      ${basicProps}
      ${psetElements}
    `;
  }

  return BUI.html`
    <bim-panel active label="BIM IFC Viewer + Backend" class="options-menu">
      <bim-panel-section label="📂 Load Models">
        <bim-label style="white-space: normal;">
          Upload IFC to backend and view in 3D
        </bim-label>
        <input
          type="file"
          accept=".ifc"
          @change=${onFileSelect}
          style="margin: 8px 0; padding: 8px; background: #333; border-radius: 4px; width: 100%;"
        />
      </bim-panel-section>

      ${loadedModels.size > 0 ? BUI.html`
        <bim-panel-section label="🏗️ Loaded Models (${loadedModels.size})">
          ${modelsList}
        </bim-panel-section>
      ` : ''}

      <bim-panel-section label="🎯 Selection">
        <bim-label>Left Click: Select element</bim-label>
        <bim-label style="color: #4ade80;">✓ Fetches data from Python backend</bim-label>
      </bim-panel-section>

      <bim-panel-section label="📋 Element Properties" style="max-height: 400px; overflow-y: auto;">
        ${propertiesContent}
      </bim-panel-section>
    </bim-panel>
  `;
}, {});

document.body.append(panel);

const button = BUI.Component.create(() => {
  return BUI.html`
    <bim-button 
      class="phone-menu-toggler" 
      icon="solar:settings-bold"
      @click="${() => {
        panel.classList.toggle("options-menu-visible");
      }}">
    </bim-button>
  `;
});

document.body.append(button);

// ========================================
// 9. Performance Stats
// ========================================
const stats = new Stats();
stats.showPanel(2);
document.body.append(stats.dom);
stats.dom.style.left = "0px";
stats.dom.style.zIndex = "unset";
world.renderer.onBeforeUpdate.add(() => stats.begin());
world.renderer.onAfterUpdate.add(() => stats.end());