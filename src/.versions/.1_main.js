// src/main.js

import * as THREE from "three";
import Stats from "stats.js";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments"; // Import fragments

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

// 4. 🛠️ Setting Up Fragments (from FRAGS)
const workerUrl = new URL("/worker.mjs", import.meta.url).href; // Use "/"
const fragments = new FRAGS.FragmentsModels(workerUrl);

// 5. 📦 Define a global 'model' variable
let model;

// 6. 🧠 Set up model loading event handlers
world.camera.controls.addEventListener("rest", () => fragments.update(true));

fragments.models.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  fragments.update(true);
});

// 7. 📂 Loading a Fragments Model
async function loadModel() {
  const file = await fetch(
    "https://thatopen.github.io/engine_fragment/resources/frags/school_arq.frag",
  );
  const buffer = await file.arrayBuffer();

  // Assign to the global 'model' variable (no 'const')
  model = await fragments.load(buffer, {
    modelId: "example",
  });

  console.log("Model loaded!");
  await fragments.update(true);
}

loadModel();

// 8. 🤏 Setting Up Raycaster
const highlightMaterial = {
  color: new THREE.Color("gold"),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
};

let localId = null;

// Use the global 'model' variable
const highlight = async () => {
  if (!localId || !model) return;
  await model.highlight([localId], highlightMaterial);
};

// Use the global 'model' variable
const resetHighlight = async () => {
  if (!localId || !model) return;
  await model.resetHighlight([localId]);
};

// 9. 🖱️ Set up Click Handler
const mouse = new THREE.Vector2();
container.addEventListener("click", async (event) => {
  mouse.x = event.clientX;
  mouse.y = event.clientY;

  // Use the global 'model' variable
  if (!model) return;

  const result = await model.raycast({
    camera: world.camera.three,
    mouse,
    dom: world.renderer.three.domElement,
  });

  const promises = [];
  if (result) {
    promises.push(resetHighlight());
    localId = result.localId;
    promises.push(highlight());

    // --- Get the data and log it (with safety check) ---
    const [data] = await model.getItemsData([localId], { attributesDefault: true });
    if (data) {
      //console.log("You clicked on object with IfcGUID:", data.GlobalId.value);
      console.log("Full properties:", data);
    } else {
      console.log("Clicked object has no data or no GlobalId.");
    }
    // ---------------------------------
  } else {
    promises.push(resetHighlight());
    localId = null;
    console.log("Clicked on empty space.");
  }
  promises.push(fragments.update(true));
  Promise.all(promises);
});

// 10. ⏱️ Measuring the performance
const stats = new Stats();
stats.showPanel(2);
document.body.append(stats.dom);
stats.dom.style.left = "0px";
stats.dom.style.zIndex = "unset";
world.renderer.onBeforeUpdate.add(() => stats.begin());
world.renderer.onAfterUpdate.add(() => stats.end());