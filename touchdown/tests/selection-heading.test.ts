import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { siteHeading, turnHeading } from "../src/scene/selectionHeading";

describe("site selection heading", () => {
  it.each([16 / 9, 390 / 844])("points toward left and right sites in the rendered view (aspect %s)", (aspect) => {
    const camera = new THREE.PerspectiveCamera(36, aspect, 0.01, 4000);
    camera.position.set(2, -3, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    for (const shipX of [-0.08, 0.062]) {
      const ship = new THREE.Vector3(shipX, 0.045, -0.44);
      for (const offset of [-0.12, 0.12]) {
        const site = new THREE.Vector3((shipX + offset) * 5, -0.15, ship.z * 5).applyMatrix4(camera.matrixWorld);
        const heading = siteHeading(ship, site, camera);
        const base = ship.clone().applyMatrix4(camera.matrixWorld).project(camera);
        const tip = ship.clone().addScaledVector(heading, 0.042).applyMatrix4(camera.matrixWorld).project(camera);
        const target = site.clone().project(camera);
        const wanted = new THREE.Vector2(target.x - base.x, target.y - base.y).normalize();
        const actual = new THREE.Vector2(tip.x - base.x, tip.y - base.y).normalize();
        expect(actual.dot(wanted)).toBeCloseTo(1, 8);
        expect(Math.sign(tip.x - base.x)).toBe(Math.sign(offset));
        expect(Math.hypot(heading.x, heading.y)).toBeGreaterThan(0.6);
      }
    }
  });

  it("reverses toward the latest target from the current heading, without a snap", () => {
    const current = new THREE.Vector3(0.74, 0.5, -0.62).normalize();
    const left = new THREE.Vector3(-0.8, -0.4, -0.6).normalize();
    const right = new THREE.Vector3(0.8, -0.4, -0.6).normalize();
    for (const target of [left, right, left]) {
      for (let i = 0; i < 60; i++) {
        const previous = current.clone();
        turnHeading(current, target, 1 / 60);
        expect(current.angleTo(previous)).toBeLessThanOrEqual(3.5 / 60 + 1e-8);
        expect(current.angleTo(target)).toBeLessThanOrEqual(previous.angleTo(target) + 1e-8);
      }
      expect(current.angleTo(target)).toBeLessThan(0.01);
    }
  });

  it("keeps the current heading when time is paused or the target coincides with the ship", () => {
    const current = new THREE.Vector3(1, 0, 0);
    turnHeading(current, new THREE.Vector3(-1, 0, 0), 0);
    turnHeading(current, new THREE.Vector3(), 1 / 60);
    expect(current.toArray()).toEqual([1, 0, 0]);
  });
});
