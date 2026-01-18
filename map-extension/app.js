// --- 0. Global Error Catcher ---
window.onerror = function(message, source, lineno, colno, error) {
  console.error("❌ GLOBAL ERROR:", message, "\nAt:", source, `:${lineno}:${colno}`, "\nError obj:", error);
  try {
    document.body.innerHTML = `<div style="padding: 20px; font-family: monospace; background: #ff0000; color: white; border: 5px solid darkred; margin: 20px; border-radius: 5px; z-index: 99999; position: fixed; top: 0; left: 0;">
      <h3>❌ A FATAL JAVASCRIPT ERROR OCCURRED:</h3>
      <p>${message}</p>
      <p>At: ${source.split('/').pop()}:${lineno}:${colno}</p>
      <p>Check the extension's console for more details.</p>
    </div>`;
  } catch (e) {}
  return true;
};

console.log("🚀 app.js script started");

// --- 1. Create and inject the NEW layout structure ---
let rootContainer, mapContainer, sidebarContainer;

function injectDynamicStyles() {
  const style = document.createElement('style');
  style.innerHTML = `
    #add-equipment-ui {
      margin-top: 20px;
      border-top: 2px solid #eee;
      padding-top: 15px;
    }
    #equipment-search-bar {
      width: 100%;
      padding: 10px;
      font-size: 14px;
      border: 1px solid #ccc;
      border-radius: 4px;
      margin-bottom: 10px;
    }
    #equipment-search-results {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #eee;
      border-radius: 4px;
    }
    .search-result-item {
      padding: 10px;
      font-size: 14px;
      cursor: grab;
      border-bottom: 1px solid #f0f0f0;
    }
    .search-result-item:hover {
      background-color: #f9f9f9;
    }
    .search-result-item:last-child {
      border-bottom: none;
    }
    .search-result-item.selected {
      background-color: #007bff;
      color: white;
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);
}

try {
  rootContainer = document.createElement('div');
  rootContainer.id = 'ryan-console-root';

  mapContainer = document.createElement('div');
  mapContainer.id = 'map-container';

  sidebarContainer = document.createElement('div');
  sidebarContainer.id = 'sidebar-container';

  rootContainer.appendChild(mapContainer);
  rootContainer.appendChild(sidebarContainer);
  
  if (document.body) {
    document.body.appendChild(rootContainer);
    console.log("✅ DOM layout injected onto document.body");
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(rootContainer);
      console.log("✅ DOM layout injected (on DOMContentLoaded)");
    });
  }
  
  injectDynamicStyles();

} catch (err) {
  console.error("❌ FAILED AT STEP 1 (DOM Creation):", err);
}

// --- 2. Global Constants and State ---
const SCALE = 5;

let stage, backgroundLayer, interactiveLayer, textLayer, transformer;

let allMapEntities = [];
let selectedNodeId = 'MTN9';
let currentTool = 'select';
let currentView = 'initial';

let allApiResources = [];
let missingResources = {};
const toolToResourceType = {
  'add-stacking-area': 'STACKING_AREA',
  'add-chute': 'CHUTE',
  'add-buffer-zone': 'GENERAL_AREA',
  'add-staging-pod': 'STAGING_AREA'
};

const equipmentSizes = {
  'STACKING_AREA': { l: 1.1, w: 1.25 },
  'CHUTE': { l: 1.1, w: 4 },
  'GENERAL_AREA': { l: 3, w: 3 },
  'STAGING_AREA': { l: 2.5, w: 2.5 }
};

const STORAGE_KEY_PREFIX = 'ryanConsole_';
let lastSaveTime = null;
let selectedImportFile = null;

// 🔧 NEW: Undo/Redo state management
let undoStack = [];
let redoStack = [];
const MAX_UNDO_HISTORY = 50;

// --- 3. UI Rendering Functions ---

function renderInitialView() {
  currentView = 'initial';
  if (!mapContainer || !sidebarContainer) {
    console.error("renderInitialView failed: mapContainer or sidebarContainer is null!");
    return;
  }
  mapContainer.innerHTML = `
    <button id="add-map-btn" class="button">Add Map</button>
  `;
  sidebarContainer.innerHTML = '<h2>My Utilities</h2><p>Load a map to begin.</p>';
}

function renderEditorSetupView() {
  currentView = 'editorSetup';
  
  const hasSavedMaps = {
    'MTN9': !!localStorage.getItem(STORAGE_KEY_PREFIX + 'MTN9'),
    'BWI1': !!localStorage.getItem(STORAGE_KEY_PREFIX + 'BWI1'),
    'PHL7': !!localStorage.getItem(STORAGE_KEY_PREFIX + 'PHL7')
  };
  
  mapContainer.innerHTML = `
    <div class="editor-setup-view">
      <h3>Load Map</h3>
      <label for="node-id-select">Node ID:</label>
      <select id="node-id-select" class="styled-select">
        <option value="MTN9">MTN9 ${hasSavedMaps.MTN9 ? '💾' : ''}</option>
        <option value="BWI1">BWI1 ${hasSavedMaps.BWI1 ? '💾' : ''}</option>
        <option value="PHL7">PHL7 ${hasSavedMaps.PHL7 ? '💾' : ''}</option>
      </select>
      <button id="load-map-btn" class="button">Load Map</button>
      <p style="margin-top: 10px; font-size: 12px; color: #666;">💾 = Saved map available</p>
    </div>
  `;
  sidebarContainer.innerHTML = '<h2>My Utilities</h2><p>Select a Node to load.</p>';
}

function renderEditorTools() {
  currentView = 'editorActive';
  const saveStatus = lastSaveTime ? `<small style="color: #666; display: block; margin-top: 5px;">Last saved: ${new Date(lastSaveTime).toLocaleTimeString()}</small>` : '';
  
  sidebarContainer.innerHTML = `
    <h2>Ryan's Console</h2>
    
    <button id="close-editor-btn" class="button" style="width: 100%; margin-bottom: 10px; background-color: #6c757d;">← Exit Editor</button>
    
    <button id="save-map-btn" class="button" style="width: 100%; margin-bottom: 10px;">💾 Save Map</button>
    ${saveStatus}
    
    <div class="tool-section" style="margin-top: 10px;">
      <button id="undo-btn" class="button" style="width: 48%; margin-right: 4%; font-size: 12px;" ${undoStack.length === 0 ? 'disabled' : ''}>↶ Undo</button>
      <button id="redo-btn" class="button" style="width: 48%; font-size: 12px;" ${redoStack.length === 0 ? 'disabled' : ''}>↷ Redo</button>
    </div>
    
    <div class="tool-section" style="margin-top: 10px;">
      <button id="reload-base-map-btn" class="button" style="width: 100%; margin-bottom: 5px; background-color: #dc3545; color: white; font-size: 12px;">🔄 Reload Base Map</button>
      <button id="export-map-btn" class="button" style="width: 100%; margin-bottom: 5px; font-size: 12px;">📥 Export Map</button>
      <button id="import-map-btn" class="button" style="width: 100%; margin-bottom: 5px; font-size: 12px;">📤 Import Map</button>
      <input type="file" id="import-map-input" accept=".json" style="display: none;">
      <div id="import-file-status" style="font-size: 11px; color: #666; margin-top: 5px; display: none;">
        <span id="import-file-name"></span>
        <button id="confirm-import-btn" class="button" style="font-size: 11px; padding: 5px 10px; margin-left: 5px;">Confirm Import</button>
        <button id="cancel-import-btn" class="button" style="font-size: 11px; padding: 5px 10px; margin-left: 5px; background-color: #6c757d;">Cancel</button>
      </div>
    </div>
    
    <div class="tool-section">
      <h3>Map Editor</h3>
      <button id="tool-select" class="tool-button ${currentTool === 'select' ? 'active' : ''}" data-tool="select">Select & Move</button>
      <button id="tool-delete" class="tool-button ${currentTool === 'delete' ? 'active' : ''}" data-tool="delete">Delete Element</button>
      <button id="tool-add-label" class="tool-button ${currentTool === 'add-label' ? 'active' : ''}" data-tool="add-label">Add Label to Element</button>
    </div>
    
    <div class="tool-section">
      <h3>Add Equipment</h3>
      <button id="tool-add-stacking-area" class="tool-button ${currentTool === 'add-stacking-area' ? 'active' : ''}" data-tool="add-stacking-area">Add Stacking Area</button>
      <button id="tool-add-chute" class="tool-button ${currentTool === 'add-chute' ? 'active' : ''}" data-tool="add-chute">Add Chute</button>
      <button id="tool-add-buffer-zone" class="tool-button ${currentTool === 'add-buffer-zone' ? 'active' : ''}" data-tool="add-buffer-zone">Add Buffer Zone</button>
      <button id="tool-add-staging-pod" class="tool-button ${currentTool === 'add-staging-pod' ? 'active' : ''}" data-tool="add-staging-pod">Add Staging Pod</button>
      <button id="tool-add-belt" class="tool-button ${currentTool === 'add-belt' ? 'active' : ''}" data-tool="add-belt">Add Belt</button>
    </div>
    
    <div id="add-equipment-ui"></div>
  `;
  
  // 🔧 FIX: Re-render equipment list if an equipment tool is active
  const resourceType = toolToResourceType[currentTool];
  if (resourceType) {
    const toolButton = document.querySelector(`[data-tool="${currentTool}"]`);
    const title = toolButton ? toolButton.innerText : 'Equipment';
    renderAddEquipmentUI(resourceType, title);
    renderEquipmentList(missingResources[resourceType] || []);
  }
}

function renderMapViewSidebar() {
  currentView = 'mapView';
  sidebarContainer.innerHTML = `
    <h2>Ryan's Console</h2>
    
    <button id="back-to-editor-btn" class="button" style="width: 100%; margin-bottom: 20px;">✏️ Edit Map</button>
    
    <div class="tool-section">
      <h3>Tools</h3>
      <p style="color: #666; font-size: 14px;">Select a utility below:</p>
      <button class="button" style="width: 100%; margin-bottom: 10px;" disabled>🔧 Tool 1 (Coming Soon)</button>
      <button class="button" style="width: 100%; margin-bottom: 10px;" disabled>🔧 Tool 2 (Coming Soon)</button>
      <button class="button" style="width: 100%; margin-bottom: 10px;" disabled>🔧 Tool 3 (Coming Soon)</button>
    </div>
  `;
}

function renderLoadingView() {
  mapContainer.innerHTML = `<div class="loading-view"><h3>Loading Map...</h3></div>`;
}

function renderAddEquipmentUI(resourceType, title) {
  const uiContainer = document.getElementById('add-equipment-ui');
  if (!uiContainer) return;
  
  uiContainer.innerHTML = `
    <h4>Add ${title}</h4>
    <input type="text" id="equipment-search-bar" placeholder="Search by label...">
    <div id="equipment-search-results"></div>
  `;
}

function renderEquipmentList(items) {
  const resultsContainer = document.getElementById('equipment-search-results');
  if (!resultsContainer) return;
  
  if (!items || items.length === 0) {
    resultsContainer.innerHTML = `<p style="padding: 10px; color: #777;">No items found.</p>`;
    return;
  }
  
  resultsContainer.innerHTML = items.map(item => `
    <div class="search-result-item" draggable="true" data-resource-id="${item.resourceId}">
      ${item.label}
    </div>
  `).join('');
}

// --- 4. Data Loading & Persistence ---

// 🔧 NEW: Undo/Redo system
function saveStateToUndoStack() {
  const state = JSON.parse(JSON.stringify(allMapEntities)); // Deep clone
  undoStack.push(state);
  
  // Limit undo history
  if (undoStack.length > MAX_UNDO_HISTORY) {
    undoStack.shift();
  }
  
  // Clear redo stack when new action is taken
  redoStack = [];
  
  console.log(`💾 Undo stack saved (${undoStack.length} states, ${allMapEntities.length} entities)`);
}

function performUndo() {
  console.log(`↶ Undo called - Stack size: ${undoStack.length}`);
  
  if (undoStack.length === 0) {
    console.log('⚠️ Nothing to undo');
    alert('Nothing to undo!');
    return;
  }
  
  // 🔧 FIX: Save current view position and zoom
  const savedPosition = { x: stage.x(), y: stage.y() };
  const savedScale = { x: stage.scaleX(), y: stage.scaleY() };
  
  // Save current state to redo stack
  const currentState = JSON.parse(JSON.stringify(allMapEntities));
  redoStack.push(currentState);
  
  // Restore previous state
  const previousState = undoStack.pop();
  allMapEntities = previousState;
  
  console.log(`↶ Restoring ${previousState.length} entities`);
  
  // Redraw map
  if (stage) stage.destroy();
  initializeMap(true);
  drawMap(allMapEntities);
  
  // 🔧 FIX: Restore view position and zoom
  stage.position(savedPosition);
  stage.scale(savedScale);
  
  renderEditorTools();
  
  console.log(`↶ Undo performed (${undoStack.length} states remaining, ${redoStack.length} redo available)`);
}

function performRedo() {
  console.log(`↷ Redo called - Stack size: ${redoStack.length}`);
  
  if (redoStack.length === 0) {
    console.log('⚠️ Nothing to redo');
    alert('Nothing to redo!');
    return;
  }
  
  // 🔧 FIX: Save current view position and zoom
  const savedPosition = { x: stage.x(), y: stage.y() };
  const savedScale = { x: stage.scaleX(), y: stage.scaleY() };
  
  // Save current state to undo stack
  const currentState = JSON.parse(JSON.stringify(allMapEntities));
  undoStack.push(currentState);
  
  // Restore next state
  const nextState = redoStack.pop();
  allMapEntities = nextState;
  
  console.log(`↷ Restoring ${nextState.length} entities`);
  
  // Redraw map
  if (stage) stage.destroy();
  initializeMap(true);
  drawMap(allMapEntities);
  
  // 🔧 FIX: Restore view position and zoom
  stage.position(savedPosition);
  stage.scale(savedScale);
  
  renderEditorTools();
  
  console.log(`↷ Redo performed (${undoStack.length} undo available, ${redoStack.length} states remaining)`);
}

// 🔧 FIX: Sync all shape transforms back to entity data before saving
function syncShapeTransformsToEntities() {
  interactiveLayer.find('.editable-shape').forEach(shape => {
    const shapeId = shape.id();
    const entity = allMapEntities.find(e => e.id === shapeId);
    
    if (entity) {
      // Get current shape position and size
      const x = shape.x();
      const y = shape.y();
      const width = shape.width() * shape.scaleX();
      const height = shape.height() * shape.scaleY();
      
      // Update entity data (convert back from scaled canvas coords)
      entity.absTrans.pt.x = x / SCALE;
      entity.absTrans.pt.y = y / SCALE;
      entity.lodGeomMap[1].s.l = width / SCALE;
      entity.lodGeomMap[1].s.w = height / SCALE;
      
      console.log(`📍 Synced ${shapeId}: pos=(${entity.absTrans.pt.x.toFixed(2)}, ${entity.absTrans.pt.y.toFixed(2)}), size=(${entity.lodGeomMap[1].s.l.toFixed(2)} x ${entity.lodGeomMap[1].s.w.toFixed(2)})`);
    }
  });
}

function saveMapToStorage(nodeId) {
  // 🔧 FIX: Sync transforms before saving
  syncShapeTransformsToEntities();
  
  const mapData = {
    nodeId: nodeId,
    entities: allMapEntities,
    timestamp: Date.now()
  };
  
  try {
    const jsonString = JSON.stringify(mapData);
    localStorage.setItem(STORAGE_KEY_PREFIX + nodeId, jsonString);
    lastSaveTime = mapData.timestamp;
    console.log(`✅ Map saved to localStorage (${(jsonString.length / 1024).toFixed(2)} KB)`);
    console.log('   Storage key:', STORAGE_KEY_PREFIX + nodeId);
    console.log('   Entities saved:', allMapEntities.length);
    return true;
  } catch (err) {
    console.error('❌ Failed to save map:', err);
    alert('Failed to save map. Storage may be full.');
    return false;
  }
}

function loadMapFromStorage(nodeId) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + nodeId);
    if (stored) {
      const mapData = JSON.parse(stored);
      console.log('✅ Map loaded from localStorage');
      console.log('   Storage key:', STORAGE_KEY_PREFIX + nodeId);
      console.log('   Entities loaded:', mapData.entities.length);
      console.log('   Last saved:', new Date(mapData.timestamp).toLocaleString());
      return mapData;
    } else {
      console.log('ℹ️ No saved map found for:', STORAGE_KEY_PREFIX + nodeId);
    }
  } catch (err) {
    console.error('❌ Failed to load map from storage:', err);
  }
  return null;
}

function exportMapToFile(nodeId) {
  // 🔧 FIX: Sync before export
  syncShapeTransformsToEntities();
  
  const mapData = {
    nodeId: nodeId,
    entities: allMapEntities,
    exportDate: new Date().toISOString(),
    version: '1.0'
  };
  
  const jsonString = JSON.stringify(mapData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `map_${nodeId}_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('✅ Map exported to file');
}

async function importMapFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const mapData = JSON.parse(e.target.result);
        
        if (!mapData.nodeId || !mapData.entities || !Array.isArray(mapData.entities)) {
          throw new Error('Invalid map file format');
        }
        
        console.log('✅ Map imported from file');
        resolve(mapData);
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function calculateMissingResources() {
  const drawnLabels = new Set(allMapEntities.map(e => e.name));
  
  missingResources = {};
  
  allApiResources.forEach(resource => {
    if (!drawnLabels.has(resource.label)) {
      const type = resource.resourceType;
      
      if (!missingResources[type]) {
        missingResources[type] = [];
      }
      
      missingResources[type].push(resource);
    }
  });
  
  console.log('✅ Missing resources calculated:', missingResources);
}

async function loadMapData(nodeId, forceReload = false) {
  if (!forceReload) {
    const savedMap = loadMapFromStorage(nodeId);
    if (savedMap) {
      console.log('📦 Using saved map from localStorage');
      allMapEntities = savedMap.entities;
      lastSaveTime = savedMap.timestamp;
      
      const response3 = await fetch(chrome.runtime.getURL('Resources-response.json'));
      if (response3.ok) {
        const resourceData = await response3.json();
        allApiResources = resourceData[0].data.resources || [];
        calculateMissingResources();
      }
      
      return allMapEntities;
    }
  }
  
  console.log(`📁 Fetching map data for Node: ${nodeId}...`);
  
  const [response1, response2, response3] = await Promise.all([
    fetch(chrome.runtime.getURL('FirstRequest-twinmap.json')),
    fetch(chrome.runtime.getURL('SecondRequest-twinmap.json')),
    fetch(chrome.runtime.getURL('Resources-response.json'))
  ]);
  
  if (!response1.ok || !response2.ok || !response3.ok) {
    throw new Error('Failed to load local JSON files. (Did you include all 3 files?)');
  }
  
  const json1 = await response1.json();
  const json2 = await response2.json();
  const resourceData = await response3.json();
  
  console.log('✅ All 3 files loaded successfully');
  
  const innerMapString1 = json1[0].data.digitalTwin2dMap;
  const innerMapString2 = json2[0].data.mapDeployment.mapContents;
  
  const innerMap1 = JSON.parse(innerMapString1);
  const innerMap2 = JSON.parse(innerMapString2);
  
  const mapEntities1 = innerMap1.e || [];
  const mapEntities2 = innerMap2.e || [];
  
  const uniqueEntitiesMap = new Map();
  mapEntities1.forEach(entity => uniqueEntitiesMap.set(entity.id, entity));
  mapEntities2.forEach(entity => uniqueEntitiesMap.set(entity.id, entity));

  allMapEntities = Array.from(uniqueEntitiesMap.values());
  console.log(`✅ Successfully parsed ${allMapEntities.length} *unique* entities`);
  
  allApiResources = resourceData[0].data.resources || [];
  console.log(`✅ Successfully parsed ${allApiResources.length} total API resources`);

  calculateMissingResources();
  
  return allMapEntities;
}

// --- 5. Konva & Map Drawing ---

function initializeMap(isEditor = true) {
  mapContainer.innerHTML = '';
  
  const width = mapContainer.clientWidth;
  const height = mapContainer.clientHeight;

  stage = new Konva.Stage({
    container: 'map-container',
    width: width,
    height: height,
    draggable: isEditor,
  });

  backgroundLayer = new Konva.Layer();
  stage.add(backgroundLayer);

  interactiveLayer = new Konva.Layer({ listening: isEditor });
  stage.add(interactiveLayer);

  textLayer = new Konva.Layer();
  stage.add(textLayer);

  stage.y(stage.height()); 
  backgroundLayer.scaleY(-1);
  interactiveLayer.scaleY(-1);
  textLayer.scaleY(-1);

  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    let newScale = e.evt.deltaY > 0 ? oldScale / 1.1 : oldScale * 1.1;
    stage.scale({ x: newScale, y: newScale });
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
  });
  
  if (isEditor) {
    transformer = new Konva.Transformer({
      nodes: [],
      keepRatio: false,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 
                       'top-center', 'bottom-center', 'middle-left', 'middle-right'],
    });
    interactiveLayer.add(transformer);
  
    stage.on('click tap', (e) => {
      const shape = e.target;

      if (shape === stage) {
        if (currentTool === 'select') {
          transformer.nodes([]);
        }
        return;
      }

      if (shape.hasName('editable-shape')) {
        if (currentTool === 'select') {
          transformer.nodes([shape]);
          shape.setDraggable(true);
        } 
        else if (currentTool === 'delete') {
          // 🔧 NEW: Save state before deletion for undo
          saveStateToUndoStack();
          
          const shapeId = shape.id();
          allMapEntities = allMapEntities.filter(e => e.id !== shapeId);
          console.log(`🗑️ Deleted entity ${shapeId} from data array`);
          
          const labelId = shape.id() + "_label";
          const label = textLayer.findOne(`#${labelId}`);
          if (label) {
            label.destroy();
          }
          
          shape.destroy();
          transformer.nodes([]);
          
          renderEditorTools(); // Update undo/redo buttons
        }
        else if (currentTool === 'add-label') {
          addLabelToShape(shape);
        }
      }
    });
    
    // 🔧 FIX: Update label position when shape is transformed
    transformer.on('transform', () => {
      const nodes = transformer.nodes();
      if (nodes.length === 1) {
        updateLabelPosition(nodes[0]);
      }
    });
    
    transformer.on('transformend', () => {
      const nodes = transformer.nodes();
      if (nodes.length === 1) {
        // 🔧 NEW: Save state after transform for undo
        saveStateToUndoStack();
        updateLabelPosition(nodes[0]);
        renderEditorTools(); // Update undo/redo buttons
      }
    });
    
    // 🔧 NEW: Save state after drag ends
    stage.on('dragend', (e) => {
      if (e.target.hasName('editable-shape')) {
        saveStateToUndoStack();
        renderEditorTools(); // Update undo/redo buttons
      }
    });
  }
}

// 🔧 NEW: Update label position and size to match shape
function updateLabelPosition(shape) {
  const labelId = shape.id() + "_label";
  const label = textLayer.findOne(`#${labelId}`);
  
  if (!label) return;
  
  // Get shape dimensions
  const width = shape.width() * shape.scaleX();
  const height = shape.height() * shape.scaleY();
  
  // Check if this is a staging pod or buffer zone (needs label above)
  const entity = allMapEntities.find(e => e.id === shape.id());
  const needsLabelAbove = entity && (entity.type === 'stagingArea' || entity.type === 'generalArea');
  
  if (needsLabelAbove) {
    // Position label above shape
    label.x(shape.x());
    label.y(shape.y() + (height / 2) + 3); // 3 units above top edge
    
    // Calculate font size that fits within shape width
    let fontSize = 10; // Start with reasonable size
    label.fontSize(fontSize);
    
    // Iteratively reduce font size until text fits within shape width
    while (label.width() > width && fontSize > 2) {
      fontSize -= 0.5;
      label.fontSize(fontSize);
    }
    
    // Center horizontally
    label.offsetX(label.width() / 2);
    label.offsetY(0);
  } else {
    // Original positioning for other types
    label.x(shape.x() - (width / 2));
    label.y(shape.y() - (height / 2) + 5);
    label.fontSize(5);
  }
  
  textLayer.batchDraw();
}

function drawMap(data) {
  let counts = { dockDoor: 0, chute: 0, areas: 0, wall: 0, other: 0 };
  
  data.forEach(item => {
    switch (item.type) {
      case 'dockDoor':
        drawDockDoor(item);
        counts.dockDoor++;
        break;
      case 'chute':
        drawChute(item);
        counts.chute++;
        break;
      case 'stagingArea':
      case 'generalArea':
        drawArea(item, true);
        counts.areas++;
        break;
      case 'stackingArea':
        drawArea(item, false);
        counts.areas++;
        break;
      case 'wall':
        drawWall(item);
        counts.wall++;
        break;
      default:
        drawOther(item);
        counts.other++;
    }
  });
  
  console.log('📍 Entities drawn:', counts);
  
  backgroundLayer.cache();
  console.log('✅ Map rendering complete!');
}

// --- 6. Individual Shape Drawing Functions ---

function createEditableRect(options) {
  const rect = new Konva.Rect(options);
  rect.name('editable-shape');
  rect.setDraggable(false);
  
  rect.on('mouseenter', () => {
    console.log('🖱️ Mouse entered shape:', rect.id()); // DEBUG
    
    if (currentTool === 'select' || currentTool === 'delete' || currentTool === 'add-label') {
      stage.container().style.cursor = 'pointer';
    }
    
    // Get tooltip text from shape ID
    const shapeId = rect.id();
    const entity = allMapEntities.find(e => e.id === shapeId);
    const tooltipText = entity ? entity.name : shapeId;
    
    console.log('🔍 Found entity for tooltip:', entity ? entity.name : 'NOT FOUND'); // DEBUG
    
    const pointerPos = stage.getPointerPosition();
    console.log('🔍 Pointer position:', pointerPos); // DEBUG
    
    showTooltip(tooltipText, pointerPos);
  });
  
  rect.on('mouseleave', () => {
    console.log('🖱️ Mouse left shape:', rect.id()); // DEBUG
    stage.container().style.cursor = 'default';
    hideTooltip();
  });
  
  rect.on('mousemove', () => {
    updateTooltipPosition(stage.getPointerPosition());
  });
  
  rect.on('dragmove', function() {
    updateLabelPosition(this);
  });
  
  return rect;
}

// 🔧 NEW: Tooltip management functions
let tooltipDiv = null;

function showTooltip(text, position) {
  console.log('🔍 Showing tooltip:', text, 'at position:', position); // DEBUG
  
  if (!tooltipDiv) {
    tooltipDiv = document.createElement('div');
    tooltipDiv.style.cssText = `
      position: fixed;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
      font-family: Arial, sans-serif;
      pointer-events: none;
      z-index: 10000;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(tooltipDiv);
    console.log('✅ Tooltip div created and appended to body'); // DEBUG
  }
  
  tooltipDiv.textContent = text;
  tooltipDiv.style.display = 'block';
  
  if (position) {
    tooltipDiv.style.left = (position.x + 15) + 'px';
    tooltipDiv.style.top = (position.y + 15) + 'px';
  }
}

function hideTooltip() {
  console.log('🔍 Hiding tooltip'); // DEBUG
  if (tooltipDiv) {
    tooltipDiv.style.display = 'none';
  }
}

function updateTooltipPosition(position) {
  if (tooltipDiv && tooltipDiv.style.display === 'block' && position) {
    tooltipDiv.style.left = (position.x + 15) + 'px';
    tooltipDiv.style.top = (position.y + 15) + 'px';
  }
}

function drawDockDoor(item) {
  const x = item.absTrans.pt.x * SCALE;
  const y = item.absTrans.pt.y * SCALE;
  const width = (item.lodGeomMap[1].s.l || item.lodGeomMap[1].s.x) * SCALE;
  const height = (item.lodGeomMap[1].s.w || item.lodGeomMap[1].s.y) * SCALE;

  const rect = createEditableRect({
    x, y, width, height,
    offsetX: width / 2, 
    offsetY: height / 2, 
    fill: 'magenta',
    stroke: 'black',
    strokeWidth: 0.5,
    id: item.id
  });
  interactiveLayer.add(rect);
  
  addLabel(rect, item.name, item.id + "_label", item.type);
}

function drawChute(item) {
  const x = item.absTrans.pt.x * SCALE;
  const y = item.absTrans.pt.y * SCALE;
  const width = (item.lodGeomMap[1].s.l || item.lodGeomMap[1].s.x) * SCALE;
  const height = (item.lodGeomMap[1].s.w || item.lodGeomMap[1].s.y) * SCALE;

  const rect = createEditableRect({
    x, y, width, height,
    offsetX: width / 2,
    offsetY: height / 2,
    fill: 'cyan',
    stroke: 'black',
    strokeWidth: 0.2,
    id: item.id
  });
  interactiveLayer.add(rect);
}

function drawArea(item, showLabel = true) {
  const x = item.absTrans.pt.x * SCALE;
  const y = item.absTrans.pt.y * SCALE;
  const width = (item.lodGeomMap[1].s.l || item.lodGeomMap[1].s.x) * SCALE;
  const height = (item.lodGeomMap[1].s.w || item.lodGeomMap[1].s.y) * SCALE;

  const rect = createEditableRect({
    x, y, width, height,
    offsetX: width / 2,
    offsetY: height / 2,
    fill: 'lightgreen',
    stroke: 'black',
    strokeWidth: 0.2,
    opacity: 0.6,
    id: item.id
  });
  interactiveLayer.add(rect);
  
  if (showLabel) {
    addLabel(rect, item.name, item.id + "_label", item.type);
  }
}

function drawWall(item) {
  const baseX = item.absTrans.pt.x;
  const baseY = item.absTrans.pt.y;
  const points = item.lodGeomMap[1].s.pts.flatMap(p => [(baseX + p.x) * SCALE, (baseY + p.y) * SCALE]);
  const wallLine = new Konva.Line({
    points: points,
    stroke: 'black',
    strokeWidth: 1,
    closed: false
  });
  backgroundLayer.add(wallLine);
}

function drawOther(item) {
  try {
    const x = item.absTrans.pt.x * SCALE;
    const y = item.absTrans.pt.y * SCALE;
    const width = (item.lodGeomMap[1].s.l || item.lodGeomMap[1].s.x) * SCALE;
    const height = (item.lodGeomMap[1].s.w || item.lodGeomMap[1].s.y) * SCALE;
    if (!width || !height) return;

    const rect = createEditableRect({
      x, y, width, height,
      offsetX: width / 2,
      offsetY: height / 2,
      fill: 'gray',
      stroke: '#555',
      strokeWidth: 0.1,
      opacity: 0.6,
      id: item.id
    });
    interactiveLayer.add(rect);
  } catch (e) { }
}

// 🔧 UPDATED: Smart label positioning based on item type
function addLabel(shape, text, labelId, itemType) {
  const width = shape.width() * (shape.scaleX ? shape.scaleX() : 1);
  const height = shape.height() * (shape.scaleY ? shape.scaleY() : 1);
  
  // Check if this needs label above (staging pods and buffer zones)
  const needsLabelAbove = itemType === 'stagingArea' || itemType === 'generalArea';
  
  let label;
  
  if (needsLabelAbove) {
    // Position above shape with font that fits within shape width
    let fontSize = 10; // Start with reasonable size
    
    label = new Konva.Text({
      x: shape.x(),
      y: shape.y() + (height / 2) + 3, // 3 units above top edge
      text: text,
      fontSize: fontSize,
      fill: 'black',
      fontStyle: 'bold',
      id: labelId
    });
    
    // Iteratively reduce font size until text fits within shape width
    while (label.width() > width && fontSize > 2) {
      fontSize -= 0.5;
      label.fontSize(fontSize);
    }
    
    label.scaleY(-1);
    label.offsetX(label.width() / 2); // Center horizontally
    label.offsetY(0);
  } else {
    // Original positioning (bottom-left corner)
    label = new Konva.Text({
      x: shape.x() - (width / 2),
      y: shape.y() - (height / 2),
      text: text,
      fontSize: 5,
      fill: 'black',
      id: labelId
    });
    
    label.scaleY(-1);
    label.y(shape.y() - (height / 2) + 5);
  }
  
  textLayer.add(label);
}

function addLabelToShape(shape) {
  if (shape.fill() !== 'gray') {
    console.log('Not a gray shape. Label tool only works on "other" elements.');
    return;
  }
  
  const entity = allMapEntities.find(item => item.id === shape.id());
  const currentText = entity ? entity.name : 'Label';
  
  const newText = window.prompt('Enter label text:', currentText);
  
  if (newText === null || newText.trim() === '') {
    console.log('Label cancelled or empty');
    return;
  }
  
  console.log(`Adding/updating label "${newText}" to shape ${shape.id()}`);
  
  if (entity) {
    entity.name = newText.trim();
  }

  const existingLabelId = shape.id() + "_label";
  const existingLabel = textLayer.findOne(`#${existingLabelId}`);
  
  if (existingLabel) {
    existingLabel.text(newText.trim());
    existingLabel.offsetX(existingLabel.width() / 2);
    existingLabel.offsetY(existingLabel.height() / 2);
  } else {
    const textNode = new Konva.Text({
      x: shape.x(),
      y: shape.y(),
      text: newText.trim(),
      fontSize: 5,
      fill: 'black',
      id: existingLabelId
    });

    textLayer.add(textNode);
    textNode.scaleY(-1);
    textNode.offsetX(textNode.width() / 2);
    textNode.offsetY(textNode.height() / 2);
  }
  
  textLayer.batchDraw();
}

function drawNewItem(resource, position) {
  // 🔧 NEW: Save state before adding new item
  saveStateToUndoStack();
  
  // 🔧 FIX: Remove misleading bounds check - items can be placed anywhere on canvas
  console.log(`📍 Placing ${resource.label} at world position (${position.x.toFixed(1)}, ${position.y.toFixed(1)})`);
  
  const size = equipmentSizes[resource.resourceType] || { l: 2, w: 2 };
  
  const mockItem = {
    id: resource.resourceId,
    name: resource.label,
    type: null,
    absTrans: {
      pt: {
        x: position.x / SCALE,
        y: position.y / SCALE
      }
    },
    lodGeomMap: {
      "1": { 
        s: { 
          type: 'rect',
          l: size.l,
          w: size.w
        } 
      }
    }
  };

  switch (resource.resourceType) {
    case 'STACKING_AREA':
      mockItem.type = 'stackingArea';
      drawArea(mockItem, false);
      break;
    case 'CHUTE':
      mockItem.type = 'chute';
      drawChute(mockItem);
      break;
    case 'GENERAL_AREA':
      mockItem.type = 'generalArea';
      drawArea(mockItem, true);
      break;
    case 'STAGING_AREA':
      mockItem.type = 'stagingArea';
      drawArea(mockItem, true);
      break;
    default:
      console.warn("Unknown resource type to draw:", resource.resourceType);
      return;
  }
  
  allMapEntities.push(mockItem);
  
  console.log(`✅ Drew ${resource.label} at (${position.x.toFixed(1)}, ${position.y.toFixed(1)})`);
  
  renderEditorTools(); // Update undo/redo buttons
}

// --- 7. Event Handlers ---

async function onRootClick(e) {
  const target = e.target;
  
  if (target.id === 'add-map-btn') {
    renderEditorSetupView();
  }
  
  if (target.id === 'load-map-btn') {
    renderLoadingView();
    try {
      const data = await loadMapData(selectedNodeId);
      initializeMap(true);
      drawMap(data);
      renderEditorTools();
    } catch (err) {
      console.error("❌ FAILED at Load Map Button:", err);
      mapContainer.innerHTML = `<div class="editor-setup-view"><h3>Error loading map.</h3><p>${err.message}</p></div>`;
    }
  }
  
  if (target.id === 'save-map-btn') {
    console.log('💾 Saving and locking map...');
    
    const success = saveMapToStorage(selectedNodeId);
    if (success) {
      currentView = 'mapView';
      
      if (transformer) transformer.nodes([]);
      stage.draggable(true);
      interactiveLayer.listening(false);
      stage.container().style.cursor = 'default';
      
      renderMapViewSidebar();
      
      const tempMsg = document.createElement('div');
      tempMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 15px 25px; border-radius: 5px; z-index: 10000; font-weight: bold;';
      tempMsg.textContent = '✅ Map Saved & Locked!';
      document.body.appendChild(tempMsg);
      setTimeout(() => tempMsg.remove(), 2000);
    }
  }
  
  if (target.id === 'close-editor-btn') {
    console.log('💾 Auto-saving before exit...');
    saveMapToStorage(selectedNodeId);
    
    if (stage) stage.destroy();
    
    renderEditorSetupView();
  }
  
  if (target.id === 'export-map-btn') {
    console.log('📥 Exporting map...');
    exportMapToFile(selectedNodeId);
  }
  
  if (target.id === 'import-map-btn') {
    const fileInput = document.getElementById('import-map-input');
    if (fileInput) {
      fileInput.click();
    }
  }
  
  if (target.id === 'confirm-import-btn') {
    if (!selectedImportFile) {
      alert('No file selected');
      return;
    }
    
    console.log('📤 Importing map from file...');
    mapContainer.innerHTML = `<div class="loading-view"><h3>Importing Map...</h3></div>`;
    
    importMapFromFile(selectedImportFile)
      .then(mapData => {
        selectedNodeId = mapData.nodeId;
        allMapEntities = mapData.entities;
        
        initializeMap(true);
        drawMap(allMapEntities);
        
        saveMapToStorage(selectedNodeId);
        
        return fetch(chrome.runtime.getURL('Resources-response.json'))
          .then(response => response.json())
          .then(resourceData => {
            allApiResources = resourceData[0].data.resources || [];
            calculateMissingResources();
            
            renderEditorTools();
            selectedImportFile = null;
            
            alert(`✅ Map imported successfully!\nNode: ${mapData.nodeId}\nEntities: ${mapData.entities.length}`);
          });
      })
      .catch(err => {
        console.error('❌ Import failed:', err);
        alert('Failed to import map: ' + err.message);
        renderEditorSetupView();
        selectedImportFile = null;
      });
  }
  
  if (target.id === 'cancel-import-btn') {
    console.log('Import cancelled');
    selectedImportFile = null;
    document.getElementById('import-file-status').style.display = 'none';
    document.getElementById('import-map-input').value = '';
  }
  
  if (target.id === 'back-to-editor-btn') {
    console.log('Entering editor mode...');
    currentView = 'editorActive';
    
    stage.draggable(true);
    interactiveLayer.listening(true);
    
    renderEditorTools();
  }
  
  // 🔧 NEW: Undo button handler
  if (target.id === 'undo-btn') {
    console.log('🔘 Undo button clicked'); // DEBUG
    performUndo();
    return;
  }
  
  // 🔧 NEW: Redo button handler
  if (target.id === 'redo-btn') {
    console.log('🔘 Redo button clicked'); // DEBUG
    performRedo();
    return;
  }
  
  if (target.id === 'reload-base-map-btn') {
    const confirmed = confirm('⚠️ Are you sure you want to reload the base map?\n\nThis will discard ALL changes and restore the original map from the API.');
    
    if (confirmed) {
      console.log('🔄 Reloading base map from API...');
      renderLoadingView();
      
      loadMapData(selectedNodeId, true)
        .then(data => {
          localStorage.removeItem(STORAGE_KEY_PREFIX + selectedNodeId);
          lastSaveTime = null;
          
          if (stage) stage.destroy();
          
          initializeMap(true);
          drawMap(data);
          renderEditorTools();
          
          console.log('✅ Base map reloaded successfully');
        })
        .catch(err => {
          console.error('❌ Failed to reload map:', err);
          alert('Failed to reload map: ' + err.message);
          renderEditorTools();
        });
    }
  }
  
  if (target.classList.contains('tool-button')) {
    const newTool = target.dataset.tool;
    
    // 🔧 FIX: Only switch tool if user explicitly clicked a tool button
    // Don't auto-switch when equipment is dropped
    console.log(`🔧 Tool button clicked: ${newTool}`);
    
    currentTool = newTool;
    
    document.querySelectorAll('.tool-button').forEach(btn => {
      btn.classList.remove('active');
    });
    target.classList.add('active');
    
    if (interactiveLayer) {
      interactiveLayer.find('.editable-shape').forEach(shape => {
        shape.setDraggable(currentTool === 'select');
      });
    }
    
    if (currentTool !== 'select' && transformer) {
      transformer.nodes([]);
    }
    
    console.log('Current tool set to:', currentTool);
    
    const resourceType = toolToResourceType[currentTool];
    if (resourceType) {
      const title = target.innerText;
      renderAddEquipmentUI(resourceType, title);
      renderEquipmentList(missingResources[resourceType] || []);
    } else {
      const uiContainer = document.getElementById('add-equipment-ui');
      if (uiContainer) uiContainer.innerHTML = '';
    }
  }
  
  if (target.classList.contains('search-result-item')) {
    const resourceId = target.dataset.resourceId;
    const resource = allApiResources.find(r => r.resourceId === resourceId);
    
    console.log("Selected resource (for dragging):", resource);
    
    document.querySelectorAll('.search-result-item').forEach(item => item.classList.remove('selected'));
    target.classList.add('selected');
  }
}

function onFileInputChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  console.log('📁 File selected:', file.name);
  selectedImportFile = file;
  
  const statusDiv = document.getElementById('import-file-status');
  const fileNameSpan = document.getElementById('import-file-name');
  
  if (statusDiv && fileNameSpan) {
    fileNameSpan.textContent = `Selected: ${file.name}`;
    statusDiv.style.display = 'block';
  }
}

function onRootInput(e) {
  const target = e.target;
  
  if (target.id === 'equipment-search-bar') {
    const searchTerm = target.value.toLowerCase();
    
    const resourceType = toolToResourceType[currentTool];
    if (!resourceType) return;
    
    const items = missingResources[resourceType] || [];
    
    const filteredItems = items.filter(item => 
      item.label.toLowerCase().includes(searchTerm)
    );
    
    renderEquipmentList(filteredItems);
  }
}

function onRootChange(e) {
  const target = e.target;
  
  if (target.id === 'node-id-select') {
    selectedNodeId = target.value;
    console.log('Node ID set to:', selectedNodeId);
  }
  
  if (target.id === 'import-map-input') {
    onFileInputChange(e);
  }
}

function onRootDragStart(e) {
  if (!e.target.classList.contains('search-result-item')) {
    e.preventDefault();
    return;
  }
  
  const resourceId = e.target.dataset.resourceId;
  const resource = allApiResources.find(r => r.resourceId === resourceId);
  
  if (resource) {
    e.dataTransfer.setData("text/plain", JSON.stringify(resource));
    e.dataTransfer.effectAllowed = "copy";
    console.log("Dragging resource:", resource.label);
  } else {
    e.preventDefault();
  }
}

function onMapDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
}

function onMapDrop(e) {
  e.preventDefault();
  
  const resource = JSON.parse(e.dataTransfer.getData("text/plain"));
  
  if (!stage) return;
  
  const mapRect = mapContainer.getBoundingClientRect();
  const dropX = e.clientX - mapRect.left;
  const dropY = e.clientY - mapRect.top;
  
  const transform = stage.getAbsoluteTransform().copy();
  transform.invert();
  const worldPos = transform.point({ x: dropX, y: dropY });
  
  const correctedPos = {
    x: worldPos.x,
    y: -worldPos.y
  };
  
  console.log(`Dropped ${resource.label} at`, correctedPos);
  
  drawNewItem(resource, correctedPos);
  
  const resourceType = resource.resourceType;
  missingResources[resourceType] = missingResources[resourceType].filter(
    item => item.resourceId !== resource.resourceId
  );
  renderEquipmentList(missingResources[resourceType] || []);
  
  // 🔧 FIX: Don't switch to select tool after dropping equipment
  // Keep the current tool active so user can continue placing items
  console.log(`✅ Equipment placed. Current tool remains: ${currentTool}`);
}

// --- 8. Initialize and Load ---
try {
  if (!rootContainer) {
    throw new Error("rootContainer was not successfully created. Script may have run before body.");
  }
  rootContainer.addEventListener('click', onRootClick);
  rootContainer.addEventListener('change', onRootChange);
  rootContainer.addEventListener('input', onRootInput);
  
  rootContainer.addEventListener('dragstart', onRootDragStart);
  mapContainer.addEventListener('dragover', onMapDragOver);
  mapContainer.addEventListener('drop', onMapDrop);
  
  console.log("✅ Event listeners attached to rootContainer");
} catch (err) {
  console.error("❌ FAILED AT STEP 8 (Attaching Listeners):", err);
}

try {
  renderInitialView();
  console.log("✅ Initial view rendered");
} catch (err) {
  console.error("❌ FAILED AT STEP 8 (Initial Render):", err);
}