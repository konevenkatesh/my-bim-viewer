// src/viewer.js
import { setupContextMenu } from "./components/ContextMenu.js";
import { setupNavbar } from "./components/Navbar.js";
import "./styles/global.css";

// Initialize Navbar
setupNavbar('viewer');

import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import Stats from "stats.js";
import * as THREE from "three";
import * as WEBIFC from "web-ifc";

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

const highlighter = components.get(OBCF.Highlighter);
highlighter.setup({
    world: world,
    selectEnabled: true,
    multiple: "ctrlKey",
});
highlighter.zoomToSelection = true;

// Centralized Selection Logic
highlighter.events.select.onHighlight.add(async (selection) => {
    console.log("🔦 Highlight Event:", selection);
    await updateSelectionUI(selection);
});

highlighter.events.select.onClear.add(() => {
    console.log("🧹 Clear Event");
    selectedElementData = null;
    updateProperties();
});

async function updateSelectionUI(selection) {
    if (!selection || Object.keys(selection).length === 0) {
        selectedElementData = null;
        updateProperties();
        return;
    }

    // For properties, just picking the first selected element for now
    // In multi-select, a list would be better, but user just asked for "allow multiple selection"
    const modelId = Object.keys(selection)[0];
    const fragIds = selection[modelId];
    if (!fragIds || fragIds.size === 0) return;
    
    const fragId = Array.from(fragIds)[0];
    
    // Get local element data for GUID
    const model = fragments.list.get(modelId);
    if (!model) return;

    const [localData] = await model.getItemsData([fragId]);
    
    // Find backend model ID
    const modelInfo = Array.from(loadedModels.entries())
      .find(([frontendId]) => frontendId === modelId);
    
    if (modelInfo && localData._guid?.value) {
      const backendModelId = modelInfo[1].backendModelId;
      const guid = localData._guid.value;
      
      console.log("🎯 Selected element GUID:", guid);
      
      // Fetch detailed data from backend
      isLoadingElement = true;
      updateProperties();
      
      try {
        const backendData = await getElementByGUID(backendModelId, guid);
        console.log("📋 Backend element data:", backendData);
        
        selectedElementData = {
          ...backendData,
          localData: localData,
          selectionCount: Object.values(selection).reduce((acc, set) => acc + set.size, 0)
        };
        
      } catch (error) {
        console.error("❌ Error fetching element from backend:", error);
        selectedElementData = { 
          error: error.message,
          localData: localData 
        };
      }
      
      isLoadingElement = false;
      updateProperties();
    }
}


const grids = components.get(OBC.Grids);
grids.create(world);

// ========================================
// 3. Setup Fragment Manager
// ========================================
const workerUrl = new URL("/worker.mjs", import.meta.url).href;
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

// Add camera reset function
const resetCamera = () => {
  world.camera.controls.setLookAt(50, 30, 50, 0, 0, 0);
  console.log("📸 Camera reset to default position");
};

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

    // Step 5: Classify Model
    console.log("📂 Classifying model:", frontendModelId);
    if (classifier && WEBIFC) {
      // v3 API: passing modelId regex to ensure we only classify what we just loaded
      // byModel() without args classifies all, which is also fine, but let's be specific for clarity if needed.
      // Actually, passing correct config format:
      await classifier.byModel({ modelIds: [new RegExp(frontendModelId)] });
      await classifier.byCategory({ modelIds: [new RegExp(frontendModelId)] });
      await classifier.byIfcBuildingStorey({ modelIds: [new RegExp(frontendModelId)] });
      
      console.log("✅ Classification complete.");
      console.log("📂 Classifier List:", classifier.list);
      // Check if it's a Map or Object
      if (classifier.list instanceof Map) {
         console.log("📂 Classifier List Keys (Map):", Array.from(classifier.list.keys()));
      } else {
         console.log("📂 Classifier List Keys (Object):", Object.keys(classifier.list));
      }
    } else {
        console.warn("⚠️ Classifier or WEBIFC not available. Skipping classification.");
    }

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
let isLoadingElement = false;

// Initialize Hider & Classifier
let hider, classifier;
try {
    hider = components.get(OBC.Hider);
    classifier = components.get(OBC.Classifier);
    if (!WEBIFC) throw new Error("WEBIFC module not loaded");
} catch(e) {
    console.warn("Failed to initialize Hider/Classifier or WEBIFC", e);
}

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

/**
 * Handle selection logic (reusable for click and context menu)
 * Returns 'true' if an element was selected, 'false' if cleared/missed
 */
async function handleSelection(event) {
  const result = await caster.castRay();
  
  if (!result) {
    // If not holding Ctrl, click on empty space clears selection
    if (!event?.ctrlKey) {
        highlighter.clear("select");
    }
    return false;
  }
  
  const modelIdMap = { 
    [result.fragments.modelId]: new Set([result.localId]) 
  };

  // Highlighter Logic:
  // - If Ctrl is held, WE DO NOT REMOVE PREVIOUS (removePrevious = false).
  // - If Ctrl is NOT held, WE REMOVE PREVIOUS (removePrevious = true).
  // - zoomToSelection = false (for manual 3D click, usually purely visual)
  const removePrevious = !event?.ctrlKey;
  await highlighter.highlightByID("select", modelIdMap, removePrevious, false);

  return true;
}

// Setup Context Menu
const contextMenu = setupContextMenu(container, {
  onIsolate: async () => {
    const selection = highlighter.selection.select;
    if (selection && Object.keys(selection).length > 0) {
      hider.isolate(selection);
      console.log("👁️ Element isolated");
    }
  },
  onHide: async () => {
    const selection = highlighter.selection.select;
    if (selection && Object.keys(selection).length > 0) {
       hider.set(false, selection);
       console.log("🙈 Element hidden");
       highlighter.clear("select"); // Clear selection after hiding
    }
  },
  onShowAll: async () => {
     hider.set(true);
     console.log("👀 Showing all elements");
  }
});

container.addEventListener("mouseup", async (event) => {
  if (!isMouseDown) return;
  isMouseDown = false;
  
  if (event.button !== 0) return; // Only process left click here
  
  await handleSelection(event);
});

container.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    
    // Select element under cursor if not already selected (optional, but good UX)
    // Actually, usually right click selects the item under it if not selected.
    await handleSelection(event);
    
    // Show menu regardless
    // But maybe check if we have a selection now?
    const hasSelection = Object.keys(highlighter.selection.select || {}).length > 0;
    
    // We could conditionally show the menu, but showing it always with disabled actions is also a pattern.
    // For now, just show it. Logic inside actions checks selection.
    contextMenu.show(event.clientX, event.clientY);
});

// ========================================
// 8. UI Panels: Explorer (Left) & Properties (Right)
// ========================================
BUI.Manager.init();

// --- 8b. Right Panel: Properties ---
let propertiesTab = 'data'; // 'data' or 'actions'

const [propertiesUI, updateProperties] = BUI.Component.create((_) => {
  const onTabChange = (tab) => {
    propertiesTab = tab;
    updateProperties();
  };

  const onIsolate = () => {
    const selection = highlighter.selection.select;
    if (selection && Object.keys(selection).length > 0) {
      hider.isolate(selection);
    }
  };

  const onHide = () => {
    const selection = highlighter.selection.select;
    if (selection && Object.keys(selection).length > 0) {
       hider.set(false, selection);
       highlighter.clear("select");
       updateProperties(); // Clear panel content if hidden
    }
  };

  const onShowAll = () => {
     hider.set(true);
  };

  const renderTabs = () => BUI.html`
    <div class="tab-group">
      <div 
        class="tab-btn ${propertiesTab === 'data' ? 'active' : ''}" 
        @click=${() => onTabChange('data')}>
        Data
      </div>
      <div 
        class="tab-btn ${propertiesTab === 'actions' ? 'active' : ''}" 
        @click=${() => onTabChange('actions')}>
        Actions
      </div>
    </div>
  `;

  // Content for Actions Tab
  const renderActions = () => BUI.html`
    <bim-panel-section label="⚡ Selection Actions">
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <bim-button 
          label="Isolate Selection" 
          icon="solar:eye-bold"
          @click=${onIsolate}>
        </bim-button>
        <bim-button 
          label="Hide Selection" 
          icon="solar:eye-closed-bold"
          @click=${onHide}>
        </bim-button>
        <bim-button 
          label="Show All" 
          icon="solar:refresh-bold"
          @click=${onShowAll}>
        </bim-button>
      </div>
    </bim-panel-section>
  `;

  let content;
  if (propertiesTab === 'actions') {
      // Actions Tab Logic
      // Check if we have a selection to enable buttons (optional visual feedback, but simple is fine)
      content = renderActions();
  } else {
      // Data Tab Logic (Existing)
      if (isLoadingElement) {
        content = BUI.html`
          <div style="text-align: center; padding: 20px;">
            <bim-label>Loading element data from backend...</bim-label>
          </div>
        `;
      } else if (!selectedElementData) {
        content = BUI.html`
          <bim-label>No element selected. Select an element to view properties.</bim-label>
        `;
      } else if (selectedElementData.error) {
        content = BUI.html`
          <div style="padding: 8px; background: #ffcccc; color: #cc0000; border-radius: 4px;">
            <bim-label>Error: ${selectedElementData.error}</bim-label>
          </div>
        `;
      } else {
        const basicProps = BUI.html`
          <div style="margin-bottom: 24px;">
            <div style="font-weight: 600; color: #4ade80; margin-bottom: 12px; font-size: 0.9rem; letter-spacing: 0.05em; text-transform: uppercase;">Basic Info</div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <span style="color: #cbd5e1; font-size: 0.85rem;">Name</span>
              <span style="font-weight: 500; color: white; font-size: 0.9rem;">${selectedElementData.name || 'N/A'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <span style="color: #cbd5e1; font-size: 0.85rem;">Type</span>
              <span style="font-weight: 500; color: white; font-size: 0.9rem;">${selectedElementData.type}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <span style="color: #cbd5e1; font-size: 0.85rem;">GUID</span>
              <span style="font-weight: 400; font-family: monospace; font-size: 0.75rem; color: #94a3b8; background: rgba(0,0,0,0.2); padding: 2px 4px; border-radius: 4px;">${selectedElementData.guid}</span>
            </div>
          </div>
        `;
        
        // Display Property Sets (Truncated for replacement, re-adding in next chunk if needed or assuming strict match)
        // Wait, I need to include the rest of the file content in the replace if I replace the whole block.
        // I will return ONLY the start of the logic here and let the existing PSET logic flow if tab is DATA.
        // Actually, cleaner to wrap existing logic.
        
        const psetElements = Object.entries(selectedElementData.psets || {}).map(([psetName, props]) => {
            const propItems = Object.entries(props).map(([key, value]) => {
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                return BUI.html`
                  <div style="display: flex; justify-content: space-between; align-items: start; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="color: #94a3b8; font-size: 0.8rem; margin-right: 8px; margin-top: 1px;">${key}</span>
                    <span style="font-weight: 500; font-size: 0.85rem; text-align: right; max-width: 65%; word-break: break-word; color: #e2e8f0; line-height: 1.4;">${displayValue}</span>
                  </div>
                `;
            });
            
            return BUI.html`
                <div style="margin-bottom: 20px;">
                <div style="font-weight: 600; color: #60a5fa; margin-bottom: 10px; font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase;">${psetName}</div>
                ${propItems}
                </div>
            `;
        });
        
        content = BUI.html`
            ${basicProps}
            ${psetElements}
        `;
    }
  }

  return BUI.html`
    <bim-panel active label="Properties" class="bim-panel-base properties-panel">
      ${renderTabs()}
      
      <bim-panel-section label="🎯 Selection Info">
        <bim-label>State: ${propertiesTab.toUpperCase()}</bim-label>
      </bim-panel-section>

      <bim-panel-section label="${propertiesTab === 'data' ? '📋 Element Properties' : '⚡ Actions'}" style="max-height: calc(100vh - 350px); overflow-y: auto;">
        ${content}
      </bim-panel-section>
    </bim-panel>
  `;
}, {});


// --- 8a. Left Panel: Object Explorer & Models ---

// Initialize Spatial Tree (BUIC) globally so it persists and we can debug it
const [spatialTree] = BUIC.tables.spatialTree({
    components,
    models: [], // Auto-updated
});
spatialTree.preserveStructureOnFilter = true;

const onSearchTree = (e) => {
  spatialTree.queryString = e.target.value;
};

const [explorerUI, updateExplorer] = BUI.Component.create((state) => {
  const onFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.disabled = true;
    try {
      await loadLocalIFC(file);
      updateExplorer({ tab: state.tab });
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
      try {
        await removeModelFromBackend(modelInfo.backendModelId);
        console.log("✅ Removed from backend");
      } catch (error) {
        console.error("⚠️ Error removing from backend:", error);
      }
    }

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
      updateProperties(); // Update properties if selection cleared
    }

    await fragments.core.update(true);
    updateExplorer({ tab: state.tab });
  };


  
  // Custom Tree building logic removed in favor of BUIC



  // --- Tab Management ---
  // Uses state.tab ('models' or 'tree')
  
  return BUI.html`
    <bim-panel active label="Object Explorer" class="bim-panel-base explorer-panel">
      
      <div class="tab-group">
        <div class="tab-btn ${state.tab === 'models' ? 'active' : ''}" 
             @click=${() => { updateExplorer({ tab: 'models' }); }}>
          Files
        </div>
        <div class="tab-btn ${state.tab === 'tree' ? 'active' : ''}"
             @click=${() => { updateExplorer({ tab: 'tree' }); }}>
          Spatial Tree
        </div>
      </div>
    
      ${state.tab === 'models' ? BUI.html`
          <bim-panel-section label="📂 Load Models">
            <bim-label style="white-space: normal;">
              Upload IFC to backend and view in 3D
            </bim-label>
            <input
              type="file"
              accept=".ifc"
              @change=${onFileSelect}
              style="margin: 8px 0; padding: 8px; background: rgba(51,51,51,0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; width: 100%; color: white;"
            />
          </bim-panel-section>

          ${loadedModels.size > 0 ? BUI.html`
            <bim-panel-section label="🏗️ Loaded Models (${loadedModels.size})">
              ${Array.from(loadedModels.entries()).map(([frontendId, info]) => {
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
              })}
            </bim-panel-section>
          ` : ''}
          
          <bim-panel-section label="👁️ View Controls">
              <bim-button 
                label="Reset View" 
                icon="solar:camera-minimalistic-bold"
                @click=${resetCamera}
                style="width: 100%; margin-top: 8px;">
              </bim-button>
          </bim-panel-section>
      ` : BUI.html`
          <!-- Tree Tab Content (BUIC) -->
          <bim-panel-section label="🌳 Model Hierarchy">
            <bim-text-input @input=${onSearchTree} placeholder="Search..." debounce="200"></bim-text-input>
            ${spatialTree}
          </bim-panel-section>
      `}

    </bim-panel>
  `;
}, { tab: 'models' });



// --- 8b. Right Panel: Properties ---



document.body.append(explorerUI);
document.body.append(propertiesUI);

// Enable Context Menu on Explorer UI (Spatial Tree)
// We attach to spatialTree directly to ensure we catch events on the tree itself
spatialTree.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  // Check if we have a valid selection in the Highlighter
  const hasSelection = Object.keys(highlighter.selection.select || {}).length > 0;
  if (hasSelection) {
    contextMenu.show(e.clientX, e.clientY);
  }
});


// Button to toggle Explorer (Left)
const explorerBtn = BUI.Component.create(() => {
  return BUI.html`
    <bim-button 
      style="position: fixed; top: 100px; left: 20px; z-index: 1000;"
      icon="solar:folder-with-files-bold"
      tooltip-title="Toggle Explorer"
      @click="${() => {
        explorerUI.classList.toggle("panel-hidden");
      }}">
    </bim-button>
  `;
});

// Button to toggle Properties (Right)
const propertiesBtn = BUI.Component.create(() => {
  return BUI.html`
    <bim-button 
      style="position: fixed; top: 100px; right: 20px; z-index: 1000;"
      icon="solar:settings-bold"
      tooltip-title="Toggle Properties"
      @click="${() => {
        propertiesUI.classList.toggle("panel-hidden");
      }}">
    </bim-button>
  `;
});

document.body.append(explorerBtn);
document.body.append(propertiesBtn);

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