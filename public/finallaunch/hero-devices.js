(function () {
  const scene = document.querySelector(".axe-3d-scene");
  if (!scene) return;

  const devices = [...scene.querySelectorAll("[data-tilt]")];

  const onMove = (event) => {
    const rect = scene.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    devices.forEach((el, index) => {
      const depth = index === 0 ? 1 : 0.65;
      const rx = (-y * 7 * depth).toFixed(2);
      const ry = (x * 10 * depth).toFixed(2);
      const tz = (8 + Math.abs(x) * 10).toFixed(1);
      el.style.setProperty("--rx", rx + "deg");
      el.style.setProperty("--ry", ry + "deg");
      el.style.setProperty("--tz", tz + "px");
    });
  };

  const reset = () => {
    devices.forEach((el) => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--tz", "0px");
    });
  };

  scene.addEventListener("mousemove", onMove);
  scene.addEventListener("mouseleave", reset);

  // Prevent hero tilt from stealing clicks meant for iframe interactions
  scene.addEventListener(
    "touchstart",
    () => {
      devices.forEach((el) => el.style.setProperty("--tz", "0px"));
    },
    { passive: true },
  );
})();
