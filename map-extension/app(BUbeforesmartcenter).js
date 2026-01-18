// --- AT THE VERY TOP OF APP.JS ---
// 💡 1. Create and inject the map container div
const mapContainer = document.createElement('div');
mapContainer.id = 'map-overlay-container';
document.body.appendChild(mapContainer);

const SCALE = 5;

// --- Load and parse the JSON files ---
async function loadMapData() {
  try {
    console.log('📁 Loading JSON files from extension...');
    
    // 💡 2. Update your fetch calls
    const response1 = await fetch(chrome.runtime.getURL('FirstRequest-twinmap.json'));
    const response2 = await fetch(chrome.runtime.getURL('SecondRequest-twinmap.json'));
    
    if (!response1.ok || !response2.ok) {
      throw new Error('Failed to load JSON files. Make sure they are in the same directory as your HTML file.');
    }
    
    // Parse the outer JSON
    const json1 = await response1.json();
    const json2 = await response2.json();
    
    console.log('✅ Files loaded successfully');
    
    // Extract the inner JSON strings
    const innerMapString1 = json1[0].data.digitalTwin2dMap;
    const innerMapString2 = json2[0].data.mapDeployment.mapContents;
    
    // Parse the inner JSON strings
    const innerMap1 = JSON.parse(innerMapString1);
    const innerMap2 = JSON.parse(innerMapString2);
    
// Combine the entity arrays
    const mapEntities1 = innerMap1.e || [];
    const mapEntities2 = innerMap2.e || [];
    
    // 💡 --- START OF NEW/REPLACED CODE --- 💡

    // De-duplicate the combined list using a Map (by entity.id)
    const uniqueEntitiesMap = new Map();

    // Add all entities from the first file
    mapEntities1.forEach(entity => {
      uniqueEntitiesMap.set(entity.id, entity);
    });

    // Add all entities from the second file
    // If an ID already exists, this will overwrite it (which is fine)
    mapEntities2.forEach(entity => {
      uniqueEntitiesMap.set(entity.id, entity);
    });

    // Convert the Map's values back into a final, unique array
    const allMapEntities = Array.from(uniqueEntitiesMap.values());
    
    // 💡 --- END OF NEW/REPLACED CODE --- 💡
    
    // Update the log message to be clear
    console.log(`✅ Successfully parsed ${allMapEntities.length} *unique* entities`);
    console.log(`   - (Found ${mapEntities1.length} in file 1)`);
    console.log(`   - (Found ${mapEntities2.length} in file 2)`);
    
    return allMapEntities;
    
  } catch (error) {
    console.error('❌ Error loading map data:', error.message);
    document.body.innerHTML = `
      <div style="padding: 20px; font-family: monospace; background: #fff3cd; border: 2px solid #856404; margin: 20px; border-radius: 5px;">
        <h3>❌ Failed to load map data</h3>
        <p><strong>Error:</strong> ${error.message}</p>
        <p><strong>Instructions:</strong></p>
        <ol>
          <li>In DevTools Network tab, find your API requests</li>
          <li>Right-click on the response → Copy → Copy Response</li>
          <li>Save each response as a JSON file:
            <ul>
              <li><code>FirstRequest-twinmap.json</code></li>
              <li><code>SecondRequest-twinmap.json</code></li>
            </ul>
          </li>
          <li>Place these files in the same folder as your HTML file</li>
          <li>Refresh this page</li>
        </ol>
      </div>
    `;
    throw error;
  }
}

// --- Konva.js Setup ---
function initializeMap() {
  const stage = new Konva.Stage({
    container: 'map-overlay-container',
    width: window.innerWidth,
    height: window.innerHeight,
    draggable: true,
  });

  // Three layers for optimal performance
  const backgroundLayer = new Konva.Layer();
  stage.add(backgroundLayer);

  const interactiveLayer = new Konva.Layer();
  stage.add(interactiveLayer);

  const textLayer = new Konva.Layer();
  stage.add(textLayer);

  // Flip coordinate system
  stage.y(stage.height()); 
  backgroundLayer.scaleY(-1);
  interactiveLayer.scaleY(-1);
  textLayer.scaleY(-1);

  // Zoom functionality
  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    
    let newScale;
    if (e.evt.deltaY > 0) {
      newScale = oldScale / 1.1;
    } else {
      newScale = oldScale * 1.1;
    }
    stage.scale({ x: newScale, y: newScale });
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
  });

  return { stage, backgroundLayer, interactiveLayer, textLayer };
}

// --- Drawing Functions ---
let interactiveLayer, textLayer, backgroundLayer;

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
        
      // 💡 CHANGE IS HERE
      case 'stagingArea':
      case 'generalArea':
        drawArea(item, true); // Draw WITH label
        counts.areas++;
        break;
      
      case 'stackingArea':
        drawArea(item, false); // Draw WITHOUT label
        counts.areas++;
        break;
      // 💡 END OF CHANGE
        
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
}

function drawDockDoor(item) {
  const x = item.absTrans.pt.x * SCALE;
  const y = item.absTrans.pt.y * SCALE;

  // 💡 THE FIX: Check for s.l/s.w OR s.x/s.y
  const width = (item.lodGeomMap[1].s.l || item.lodGeomMap[1].s.x) * SCALE;
  const height = (item.lodGeomMap[1].s.w || item.lodGeomMap[1].s.y) * SCALE;

  const rect = new Konva.Rect({
    x: x,
    y: y,
    width: width,
    height: height,
    offsetX: width / 2, 
    offsetY: height / 2, 
    fill: 'magenta',
    stroke: 'black',
    strokeWidth: 0.5,
    name: item.id
  });
  interactiveLayer.add(rect);
  addLabel(x - (width / 2), y - (height / 2), item.name);
}

function drawChute(item) {
  const x = item.absTrans.pt.x * SCALE;
  const y = item.absTrans.pt.y * SCALE;

  // 💡 THE FIX: Check for s.l/s.w OR s.x/s.y
  const width = (item.lodGeomMap[1].s.l || item.lodGeomMap[1].s.x) * SCALE;
  const height = (item.lodGeomMap[1].s.w || item.lodGeomMap[1].s.y) * SCALE;

  const rect = new Konva.Rect({
    x: x,
    y: y,
    width: width,
    height: height,
    offsetX: width / 2,
    offsetY: height / 2,
    fill: 'cyan',
    stroke: 'black',
    strokeWidth: 0.2,
    name: item.id
  });
  interactiveLayer.add(rect);
}

function drawArea(item, showLabel = true) {
  const x = item.absTrans.pt.x * SCALE;
  const y = item.absTrans.pt.y * SCALE;

  // 💡 THE FIX: Check for s.l/s.w OR s.x/s.y
  const width = (item.lodGeomMap[1].s.l || item.lodGeomMap[1].s.x) * SCALE;
  const height = (item.lodGeomMap[1].s.w || item.lodGeomMap[1].s.y) * SCALE;

  const rect = new Konva.Rect({
    x: x,
    y: y,
    width: width,
    height: height,
    offsetX: width / 2,
    offsetY: height / 2,
    fill: 'lightgreen',
    stroke: 'black',
    strokeWidth: 0.2,
    opacity: 0.6,
    name: item.id
  });
  interactiveLayer.add(rect);
  
  if (showLabel) {
    addLabel(x - (width / 2), y - (height / 2), item.name);
  }
}

function drawWall(item) {
  const baseX = item.absTrans.pt.x;
  const baseY = item.absTrans.pt.y;
  
  const points = item.lodGeomMap[1].s.pts.flatMap(point => [
    (baseX + point.x) * SCALE,
    (baseY + point.y) * SCALE
  ]);

  const wallLine = new Konva.Line({
    points: points,
    stroke: 'black',
    strokeWidth: 1,
    closed: false
  });
  backgroundLayer.add(wallLine);
}

// 💡 ADD THIS NEW FUNCTION
function drawOther(item) {
  try {
    const x = item.absTrans.pt.x * SCALE;
    const y = item.absTrans.pt.y * SCALE;
    
    const width = (item.lodGeomMap[1].s.l || item.lodGeomMap[1].s.x) * SCALE;
    const height = (item.lodGeomMap[1].s.w || item.lodGeomMap[1].s.y) * SCALE;
    
    if (!width || !height) {
      return;
    }

    const rect = new Konva.Rect({
      x: x,
      y: y,
      width: width,
      height: height,
      
      // 💡 THE FIX: Tell Konva to draw from the center
      offsetX: width / 2,
      offsetY: height / 2,

      fill: 'gray',
      stroke: '#555',
      strokeWidth: 0.1,
      opacity: 0.6,
      name: item.id
    });
    interactiveLayer.add(rect);

  } catch (e) {
    // This will catch errors if the geometry path is completely different
    // (e.g., item.lodGeomMap[1].s doesn't exist)
    // We can safely ignore these.
  }
}

function addLabel(x, y, text) {
  const label = new Konva.Text({
    x: x,
    y: y,
    text: text,
    fontSize: 5,
    fill: 'black',
  });
  label.scaleY(-1);
  label.y(y + 5);
  textLayer.add(label);
}

// --- Initialize and Load ---
(async function() {
  try {
    // Initialize the stage and layers
    const layers = initializeMap();
    backgroundLayer = layers.backgroundLayer;
    interactiveLayer = layers.interactiveLayer;
    textLayer = layers.textLayer;
    
    // Load and parse the data
    const allMapEntities = await loadMapData();
    
    // Draw the map
    drawMap(allMapEntities);
    
    // Cache the background layer for better performance
    backgroundLayer.cache();
    
    console.log('✅ Map rendering complete!');
    
  } catch (error) {
    console.error('Failed to initialize map:', error);
  }
})();