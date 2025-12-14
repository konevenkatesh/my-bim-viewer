// src/main.js
import * as THREE from "three";
import Stats from "stats.js";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as BUI from "@thatopen/ui";

// 1. Setup Container and Components
const container = document.getElementById("container");
const components = new OBC.Components();

// 2. Setup World
const worlds = components.get(OBC.Worlds);
const world = worlds.create();
world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = new THREE.Color(0x2a2a2a);
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.SimpleCamera(components);
world.camera.controls.setLookAt(50, 30, 50, 0, 0, 0);
components.init();

// const grids = components.get(OBC.Grids);
// grids.create(world);

// 3. Setup Fragment Manager
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

// 4. IFC Conversion Setup
const serializer = new FRAGS.IfcImporter();
serializer.wasm = { 
  absolute: true, 
  path: "https://unpkg.com/web-ifc@0.0.72/" 
};

const loadedModels = new Map();

// 5. Load Local IFC File
const loadLocalIFC = async (file) => {
  const buffer = await file.arrayBuffer();
  const ifcBytes = new Uint8Array(buffer);
  
  const fragmentBytes = await serializer.process({
    bytes: ifcBytes,
    progressCallback: (progress) => {
      console.log(`Progress: ${(progress * 100).toFixed(1)}%`);
    },
  });
  
  const modelId = `${file.name.split(".")[0]}_${Date.now()}`;
  const model = await fragments.core.load(fragmentBytes, { modelId });
  
  loadedModels.set(modelId, {
    name: file.name,
    timestamp: new Date().toLocaleString()
  });
  
  return { model, modelId };
};

// 6. Setup Raycaster - FIXED: Prevent selection during camera rotation
const casters = components.get(OBC.Raycasters);
const caster = casters.get(world);

let selectedAttributes = null;
let lastSelectedModelIdMap = null;
const highlightColor = new THREE.Color("gold");

// FIXED: Track mouse position to detect drag vs click
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
    
    // If mouse moved more than 5 pixels, it's a drag
    if (deltaX > 5 || deltaY > 5) {
      isMouseDown = false; // Cancel the click
    }
  }
});

container.addEventListener("mouseup", async (event) => {
  // FIXED: Only process selection if mouse didn't move (not a drag)
  if (!isMouseDown) return;
  
  isMouseDown = false;
  
  // FIXED: Ignore right-click (button 2)
  if (event.button !== 0) return;
  
  const result = await caster.castRay();
  
  // Clear previous selection first
  if (lastSelectedModelIdMap) {
    await fragments.resetHighlight();
  }
  
  // If clicked on empty space, just clear and return
  if (!result) {
    lastSelectedModelIdMap = null;
    selectedAttributes = null;
    updatePanel();
    return;
  }
  
  const modelIdMap = { 
    [result.fragments.modelId]: new Set([result.localId]) 
  };
  
  lastSelectedModelIdMap = modelIdMap;
  
  // Get element data
  const model = fragments.list.get(result.fragments.modelId);
  if (model) {
    const [data] = await model.getItemsData([result.localId]);
    selectedAttributes = data;
    console.log("Selected Element Data:", data);
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

// 7. UI Panel
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
      alert("Failed to load IFC file");
    }
    event.target.disabled = false;
    event.target.value = '';
  };

  const onRemoveModel = async (modelId) => {
    const model = fragments.list.get(modelId);
    if (model) {
      world.scene.three.remove(model.object);
      fragments.list.delete(modelId);
      model.dispose();
    }
    
    loadedModels.delete(modelId);
    
    if (lastSelectedModelIdMap && lastSelectedModelIdMap[modelId]) {
      await fragments.resetHighlight();
      lastSelectedModelIdMap = null;
      selectedAttributes = null;
    }
    
    await fragments.core.update(true);
    updatePanel();
  };

  const modelsList = Array.from(loadedModels.entries()).map(([modelId, info]) => {
    return BUI.html`
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #333; border-radius: 4px; margin-bottom: 8px;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${info.name}
          </div>
          <div style="font-size: 0.75rem; color: #888;">
            ${info.timestamp}
          </div>
        </div>
        <bim-button 
          style="margin-left: 8px;"
          label="Remove" 
          @click=${() => onRemoveModel(modelId)}>
        </bim-button>
      </div>
    `;
  });

  let propertiesContent = BUI.html`
    <bim-label>No element selected. Click an element to view properties.</bim-label>
  `;

  if (selectedAttributes) {
    const props = Object.entries(selectedAttributes)
      .filter(([key]) => key !== 'expressId')
      .map(([key, prop]) => {
        const value = prop?.value ?? 'N/A';
        return BUI.html`
          <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #333;">
            <span style="color: #888;">${key}:</span>
            <span style="font-weight: 500; word-break: break-all;">${String(value)}</span>
          </div>
        `;
      });

    propertiesContent = BUI.html`${props}`;
  }

  return BUI.html`
    <bim-panel active label="BIM IFC Viewer" class="options-menu">
      <bim-panel-section label="📂 Load Models">
        <bim-label style="white-space: normal;">
          Select IFC files from your computer. Multiple models supported.
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
        <bim-label>Click empty space: Deselect</bim-label>
        <bim-label style="color: #888; font-size: 0.85rem;">Right-click drag: Rotate view</bim-label>
      </bim-panel-section>

      <bim-panel-section label="📋 Element Properties">
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

// 8. Performance Stats
const stats = new Stats();
stats.showPanel(2);
document.body.append(stats.dom);
stats.dom.style.left = "0px";
stats.dom.style.zIndex = "unset";
world.renderer.onBeforeUpdate.add(() => stats.begin());
world.renderer.onAfterUpdate.add(() => stats.end());