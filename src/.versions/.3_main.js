// src/main.js

import * as THREE from "three";
import Stats from "stats.js";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments"; // Import fragments
import * as BUI from "@thatopen/ui";

// 1. 🖼️ Getting the container
const container = document.getElementById("container");

// 2. 🚀 Creating a components instance
const components = new OBC.Components();

// 3. 🌎 Setting up a Simple Scene (from OBC)
const worlds = components.get(OBC.Worlds);
const world = worlds.create();
world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = new THREE.Color(0x222222);
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.SimpleCamera(components);
world.camera.controls.setLookAt(58, 22, -25, 13, 0, 4.2);
components.init();

// const grids = components.get(OBC.Grids);
// grids.create(world);


// 🛠️ Setting Up Fragments (from FRAGS)
const workerUrl = new URL("/worker.mjs", import.meta.url).href; // Use "/"
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

world.camera.controls.addEventListener("rest", () =>
  fragments.core.update(true),
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



const fragPaths = ["https://thatopen.github.io/engine_components/resources/frags/school_arq.frag"];
await Promise.all(
  fragPaths.map(async (path) => {
    const modelId = path.split("/").pop()?.split(".").shift();
    if (!modelId) return null;
    const file = await fetch(path);
    const buffer = await file.arrayBuffer();
    return fragments.core.load(buffer, { modelId });
  }),
);


// 🤏 Setting Up Raycaster
const highlightMaterial = {
  color: new THREE.Color("gold"),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
};


const casters = components.get(OBC.Raycasters);
// Each raycaster is associated with a specific world.
// Here, we retrieve the raycaster for the `world` used in our scene.
const caster = casters.get(world);


// We set a selection callback, so we can decide what
// happen with the selected element later
let onSelectCallback = (_modelIdMap) => {};

container.addEventListener("dblclick", async () => {
  const result = await caster.castRay();
  if (!result) return;
  // The modelIdMap is how selections are represented in the engine.
  // The keys are modelIds, while the values are sets of localIds (items within the model)
  const modelIdMap = { [result.fragments.modelId]: new Set([result.localId]) };
  onSelectCallback(modelIdMap);
});

let onItemSelected = () => {};
let attributes;

// We set the color outside just to be able to change it from the UI
const color = new THREE.Color("purple");

onSelectCallback = async (modelIdMap) => {
  const modelId = Object.keys(modelIdMap)[0];
  if (modelId && fragments.list.get(modelId)) {
    const model = fragments.list.get(modelId);
    if (!model) return;
    const [data] = await model.getItemsData([...modelIdMap[modelId]]);
    attributes = data;
  }

  await fragments.highlight(
    {
      color,
      renderedFaces: FRAGS.RenderedFaces.ONE,
      opacity: 1,
      transparent: false,
    },
    modelIdMap,
  );

  await fragments.core.update(true);

  onItemSelected();
};


BUI.Manager.init();


const [panel, updatePanel] = BUI.Component.create((_) => {
  /**
   * @param {{ target: { color: any } }} param0
   */
  const onColorChange = ({ target }) => {
    color.set(target.color);
  };

  let nameLabel = BUI.html`<bim-label>There is no item name to display.</bim-label>`;
  if (attributes && "value" in attributes.Name) {
    nameLabel = BUI.html`<bim-label>${attributes.Name.value}</bim-label>`;
  }

  const onClearColors = async ({ target }) => {
    target.loading = true;
    await fragments.resetHighlight();
    await fragments.core.update(true);
    target.loading = false;
  };

  return BUI.html`
    <bim-panel active label="Raycasters Tutorial" class="options-menu">
      <bim-panel-section label="Controls">
        <bim-label>Double Click: Colorize element</bim-label>
        <bim-color-input @input=${onColorChange} color=#${color.getHexString()}></bim-color-input>
        <bim-button label="Clear Colors" @click=${onClearColors}></bim-button>
      </bim-panel-section>
      <bim-panel-section label="Item Data">
        ${nameLabel}
      </bim-panel-section>
    </bim-panel>
  `;
}, {});

onItemSelected = () => updatePanel();

document.body.append(panel);



const button = BUI.Component.create<BUI.PanelSection>(() => {
  return BUI.html`
      <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
        @click="${() => {
          if (panel.classList.contains("options-menu-visible")) {
            panel.classList.remove("options-menu-visible");
          } else {
            panel.classList.add("options-menu-visible");
          }
        }}">
      </bim-button>
    `;
});

document.body.append(button);





const stats = new Stats();
stats.showPanel(2);
document.body.append(stats.dom);
stats.dom.style.left = "0px";
stats.dom.style.zIndex = "unset";
world.renderer.onBeforeUpdate.add(() => stats.begin());
world.renderer.onAfterUpdate.add(() => stats.end());







