// Procedural low-bypass afterburning turbofan, built from revolved profiles.
// Generic shape, not a model of any specific engine. Axis along +x: inlet at x = 0, nozzle exit at x = EXIT.
// Units are arbitrary (about 1 unit = 1 m); only proportions matter.
import {
  BoxGeometry, CatmullRomCurve3, CylinderGeometry, DoubleSide, Group, InstancedMesh, LatheGeometry,
  MathUtils, Matrix4, Mesh, MeshStandardMaterial, Object3D, TubeGeometry, Vector2, Vector3,
} from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

export const EXIT = 4.9;        // nozzle exit station
export const EXIT_RADIUS = 0.43; // inner radius at the exit

const CREASE = MathUtils.degToRad(30);

const metal = (color, metalness, roughness, extra = {}) =>
  new MeshStandardMaterial({ color, metalness, roughness, side: DoubleSide, ...extra });

const MAT = {
  case: metal(0x9aa0a6, 0.85, 0.36),
  flange: metal(0x6c7279, 0.8, 0.42),
  dark: metal(0x1f2226, 0.5, 0.65),
  blade: metal(0xc7cbcf, 0.9, 0.26),
  nozzle: metal(0x4b4642, 0.75, 0.48),
  pipe: metal(0xa9773f, 0.9, 0.34),
  liner: new MeshStandardMaterial({ color: 0x2a1a10, emissive: 0xff6a1a, emissiveIntensity: 1.6, roughness: 0.8, side: DoubleSide }),
};

// Revolve [axial, radius] pairs around the x axis. Creased normals keep flange edges sharp.
function lathe(profile, material, segments = 96) {
  const geometry = new LatheGeometry(profile.map(([a, r]) => new Vector2(r, a)), segments).rotateZ(-Math.PI / 2);
  return new Mesh(toCreasedNormals(geometry, CREASE), material);
}

// Raised ring on a profile: up, across, down.
const flange = (a, w, r0, r1) => [[a, r0], [a, r1], [a + w, r1], [a + w, r0]];

export function buildEngine() {
  const engine = new Group();

  // ---- outer case, one continuous profile from the inlet duct around the lip to the nozzle ----
  const caseProfile = [
    [0.95, 0.49], [0.1, 0.49], [0.03, 0.5], [0.0, 0.525], [0.02, 0.552], [0.08, 0.562],
    [0.9, 0.566], ...flange(0.9, 0.06, 0.566, 0.59),
    [1.05, 0.56], [1.35, 0.5],
    ...flange(1.6, 0.03, 0.494, 0.512), [2.0, 0.482],
    ...flange(2.0, 0.03, 0.482, 0.5), [2.35, 0.472],
    [2.45, 0.5], ...flange(2.47, 0.04, 0.5, 0.522), [2.85, 0.5], ...flange(2.85, 0.04, 0.5, 0.522), [2.95, 0.472],
    [3.5, 0.47], ...flange(3.5, 0.025, 0.47, 0.486), [4.1, 0.466],
    ...flange(4.1, 0.05, 0.466, 0.49), [4.18, 0.452],
  ];
  engine.add(lathe(caseProfile, MAT.case));

  // ---- flange rings drawn darker on top of the case (same radii, tiny overlap avoids z-fighting) ----
  for (const [a, w, r] of [[0.9, 0.06, 0.5905], [1.6, 0.03, 0.5125], [2.0, 0.03, 0.5005], [2.47, 0.04, 0.5225], [2.85, 0.04, 0.5225], [3.5, 0.025, 0.4865], [4.1, 0.05, 0.4905]]) {
    engine.add(lathe([[a - 0.0005, r - 0.004], [a - 0.0005, r], [a + w + 0.0005, r], [a + w + 0.0005, r - 0.004]], MAT.flange));
  }

  // ---- spinner and the dark core face behind the fan (blocks the view through the duct) ----
  engine.add(lathe([[0.17, 0], [0.2, 0.035], [0.27, 0.075], [0.38, 0.105], [0.5, 0.116], [0.64, 0.116]], MAT.dark, 64));
  engine.add(lathe([[0.64, 0.116], [0.64, 0.492]], MAT.dark, 64));

  // ---- fan: 24 twisted blades ----
  const BLADES = 24, ROOT = 0.118, TIP = 0.486;
  const blade = new BoxGeometry(0.13, TIP - ROOT, 0.01, 1, 10, 1).translate(0, (ROOT + TIP) / 2, 0);
  const pos = blade.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y - ROOT) / (TIP - ROOT);
    const twist = 0.55 + 0.5 * t; // stagger grows toward the tip
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setXYZ(i, x * Math.cos(twist) - z * Math.sin(twist), y, x * Math.sin(twist) + z * Math.cos(twist));
  }
  blade.computeVertexNormals();
  const fan = new InstancedMesh(blade, MAT.blade, BLADES);
  const turn = new Matrix4();
  for (let i = 0; i < BLADES; i++) fan.setMatrixAt(i, turn.makeRotationX((i / BLADES) * Math.PI * 2));
  const fanHub = new Group();
  fanHub.position.x = 0.44;
  fanHub.add(fan);
  engine.add(fanHub);

  // ---- nozzle: 18 flat petals (faceted revolve), open at full afterburner ----
  const nozzle = lathe([
    [4.16, 0.476], [4.55, 0.432], [EXIT, 0.452], [EXIT, EXIT_RADIUS], [4.55, 0.414], [4.16, 0.446],
  ], MAT.nozzle, 18);
  engine.add(nozzle);
  // Hot liner inside the nozzle and the flame holder face deep inside.
  engine.add(lathe([[EXIT - 0.005, EXIT_RADIUS - 0.004], [4.55, 0.41], [4.18, 0.44], [3.7, 0.44]], MAT.liner, 64));
  engine.add(lathe([[3.7, 0.44], [3.7, 0]], MAT.liner, 64));

  // ---- nozzle actuators: 9 rods from the last case flange to the petals ----
  const rod = new CylinderGeometry(0.012, 0.012, 1, 10).rotateZ(Math.PI / 2);
  const rods = new InstancedMesh(rod, MAT.flange, 9);
  const o = new Object3D();
  const a0 = new Vector3(3.95, 0, 0.5), a1 = new Vector3(4.6, 0, 0.452);
  for (let i = 0; i < 9; i++) {
    const phi = (i / 9) * Math.PI * 2 + 0.17;
    const p0 = a0.clone().applyAxisAngle(new Vector3(1, 0, 0), phi);
    const p1 = a1.clone().applyAxisAngle(new Vector3(1, 0, 0), phi);
    o.position.copy(p0).add(p1).multiplyScalar(0.5);
    o.scale.set(p0.distanceTo(p1), 1, 1);
    o.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), p1.clone().sub(p0).normalize());
    o.updateMatrix();
    rods.setMatrixAt(i, o.matrix);
  }
  engine.add(rods);

  // ---- external plumbing and an accessory gearbox on the underside ----
  const pipe = (points, radius) => {
    const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
    return new Mesh(new TubeGeometry(curve, 64, radius, 10, false), MAT.pipe);
  };
  const around = (x, r, deg) => [x, r * Math.cos(MathUtils.degToRad(deg)), r * Math.sin(MathUtils.degToRad(deg))];
  engine.add(pipe([around(1.1, 0.57, 200), around(1.5, 0.535, 205), around(2.2, 0.515, 210), around(2.6, 0.545, 212), around(3.3, 0.505, 215)], 0.016));
  engine.add(pipe([around(1.2, 0.565, 150), around(1.9, 0.52, 140), around(2.6, 0.548, 135), around(3.0, 0.53, 130)], 0.013));
  engine.add(pipe([around(1.7, 0.53, 30), around(2.3, 0.512, 40), around(2.65, 0.55, 45)], 0.011));
  const gearbox = new Mesh(new BoxGeometry(0.55, 0.12, 0.2), MAT.flange);
  gearbox.position.set(1.55, -0.55, 0);
  engine.add(gearbox);
  const gearboxCap = new Mesh(new CylinderGeometry(0.06, 0.06, 0.24, 24), MAT.dark);
  gearboxCap.position.set(1.4, -0.555, 0);
  gearboxCap.rotation.x = Math.PI / 2;
  engine.add(gearboxCap);

  engine.userData.fan = fanHub;
  return engine;
}

export const ENGINE_MATERIALS = MAT;
