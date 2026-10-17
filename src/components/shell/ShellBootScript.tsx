/**
 * Blocking boot: apply route + viewport classes before first paint so the
 * SSR HTML does not flash a desktop/empty layout on a phone.
 *
 * Defaults are phone + no route flags. Cookie axe.shell-viewport overrides
 * the viewport when the user has visited before.
 */
export function ShellBootScript() {
  const source = `
(function () {
  try {
    var path = location.pathname || "";
    if (path === "/chart" || path.indexOf("/chart/") === 0) document.body.classList.add("tos-route-chart");
    if (path === "/chat" || path.indexOf("/chat/") === 0) document.body.classList.add("tos-route-chat");
    var match = document.cookie.match(/(?:^|; )axe\\.shell-viewport=([^;]*)/);
    var viewport = match ? decodeURIComponent(match[1]) : "phone";
    if (viewport === "tablet") {
      document.body.classList.add("tos-tablet-device");
      if (window.matchMedia && window.matchMedia("(orientation: landscape)").matches) {
        document.body.classList.add("tos-tablet-landscape");
      }
    }
    if (viewport === "desktop") document.body.classList.add("tos-shell-mouse-desktop");
  } catch (e) {}
})();
`;
  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}
