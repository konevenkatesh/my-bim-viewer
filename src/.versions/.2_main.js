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


// Converting IFCs to Fragments would go here
const serializer = new FRAGS.IfcImporter();
serializer.wasm = { absolute: true, path: "https://unpkg.com/web-ifc@0.0.72/" };
// A convenient variable to hold the ArrayBuffer data loaded into memory
let fragmentBytes = null;
let onConversionFinish = () => {};

const convertIFC = async () => {
  const url =
    "https://thatopen.github.io/engine_fragment/resources/ifc/school_str.ifc";
  const ifcFile = await fetch(url);
  const ifcBuffer = await ifcFile.arrayBuffer();
  const ifcBytes = new Uint8Array(ifcBuffer);
  fragmentBytes = await serializer.process({
    bytes: ifcBytes,
    progressCallback: (progress, data) => console.log(progress, data),
  });
  onConversionFinish();
};


// 🛠️ Setting Up Fragments (from FRAGS)
const workerUrl = new URL("/worker.mjs", import.meta.url).href; // Use "/"
const fragments = new FRAGS.FragmentsModels(workerUrl);

world.camera.controls.addEventListener("rest", () => fragments.update(true));

const loadModel = async () => {
  if (!fragmentBytes) return;
  const model = await fragments.load(fragmentBytes, { modelId: "example" });
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  await fragments.update(true);
};

const removeModel = async () => {
  await fragments.disposeModel("example");
};


BUI.Manager.init();

const [panel, updatePanel] = BUI.Component.create(
  (_) => {
    const onDownload = () => {
      if (!fragmentBytes) return;
      const file = new File([fragmentBytes], "sample.frag");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
    };

    let content = BUI.html`
      <bim-label style="white-space: normal;">💡 Open the console to see more information</bim-label>
      <bim-button label="Load IFC" @click=${convertIFC}></bim-button>
    `;
    if (fragmentBytes) {
      content = BUI.html`
        <bim-label style="white-space: normal;">🚀 The IFC has been converted to Fragments binary data. Add the model to the scene!</bim-label>
        <bim-button label="Add Model" @click=${loadModel}></bim-button>
        <bim-button label="Remove Model" @click=${removeModel}></bim-button>
        <bim-button label="Download Fragments" @click=${onDownload}></bim-button>
      `;
    }

    return BUI.html`
    <bim-panel id="controls-panel" active label="IFC Importer" class="options-menu">
      <bim-panel-section label="Controls">
        ${content}
      </bim-panel-section>
    </bim-panel>
  `;
  },
  {},
);

onConversionFinish = () => updatePanel();
fragments.models.list.onItemDeleted.add(() => updatePanel());

document.body.append(panel);


const button = BUI.Component.create<BUI.PanelSection>(() => {
  const onClick = () => {
    if (panel.classList.contains("options-menu-visible")) {
      panel.classList.remove("options-menu-visible");
    } else {
      panel.classList.add("options-menu-visible");
    }
  };

  return BUI.html`
    <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
      @click=${onClick}>
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