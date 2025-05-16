const THREE = window.THREE;

let ribbon = null;

/**
 * Создает 3D-ленту (ribbon) из bbox и видео, добавляет в указанный объект-сцену.
 * @param {Array} bbox - [x, y, w, h] в пикселях (из coco-ssd)
 * @param {HTMLVideoElement} video - видеоэлемент с камерой
 * @param {THREE.Object3D} scene - объект, куда добавить ленту (обычно el.object3D)
 * @param {Object} [opts] - опции: {curvePoints, tubeRadius, tubeSegments}
 * @returns {THREE.Mesh} - созданная лента
 */
export function createRibbonFromBBox(bbox, video, scene, opts = {}) {
  console.log('[ar-ribbons] createRibbonFromBBox called', { bbox, video, scene, opts });
  if (!bbox) {
    console.warn('[ar-ribbons] bbox is missing or invalid', bbox);
    return null;
  }
  if (!video) {
    console.warn('[ar-ribbons] video is missing or invalid', video);
    return null;
  }
  if (ribbon) {
    // Уже есть лента — не создаём новую
    return ribbon.mesh;
  }

  // Для теста: лента из (0,0,0) в (0,0,-4)
  const start = new THREE.Vector3(0, 0, 0);
  const end = new THREE.Vector3(0, 0, -4);
  const points = [
    start,
    new THREE.Vector3(0, 0.5, -2), // изгиб для красоты
    end
  ];

  const curve = new THREE.CatmullRomCurve3(points);
  const tubeSegments = 64;
  const tubeRadius = 0.2; // увеличен для теста
  const geometry = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 12, false);

  // Временно делаем материал ярким
  const material = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    wireframe: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1000;

  scene.add(mesh);
  ribbon = { mesh, curve, end };

  // Проверка: есть ли Mesh в сцене
  const meshes = scene.children.filter(obj => obj.type === 'Mesh');
  console.log('[ar-ribbons] Meshes in scene:', meshes.length, meshes);

  // Проверка: координаты ленты
  console.log('[ar-ribbons] Ribbon points:', points.map(p => p.toArray()));

  // Проверка: камера
  const camera = scene.children.find(obj => obj.isCamera);
  if (camera) {
    console.log('[ar-ribbons] Camera position:', camera.position.toArray());
  } else {
    console.warn('[ar-ribbons] No camera found in scene!');
  }

  // Проверка: TubeGeometry вручную (можно раскомментировать для ручного теста)
  // const testPoints = [new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(1,1,-3.5)];
  // const testCurve = new THREE.CatmullRomCurve3(testPoints);
  // const testGeometry = new THREE.TubeGeometry(testCurve, 64, 0.2, 12, false);
  // const testMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  // const testMesh = new THREE.Mesh(testGeometry, testMaterial);
  // scene.add(testMesh);

  return mesh;
}

export function removeRibbon(scene) {
  if (ribbon) {
    scene.remove(ribbon.mesh);
    ribbon.mesh.geometry.dispose();
    if (ribbon.mesh.material.map) ribbon.mesh.material.map.dispose();
    ribbon.mesh.material.dispose();
    ribbon = null;
  }
} 