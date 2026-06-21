(function () {
  // Tilt removed — devices render flat (straight-on), shots.so-style.
  // Keep any tilt CSS vars pinned to neutral in case other styles read them.
  const scene = document.querySelector(".axe-3d-scene");
  if (!scene) return;

  const devices = [...scene.querySelectorAll("[data-tilt]")];
  devices.forEach((el) => {
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--tz", "0px");
  });
})();
