/* GETX sample — shared behaviour: light/dark toggle (persisted) + Lucide icons.
   Toggle button: any element with [data-theme-toggle]. Default theme: dark. */
(function () {
  var K = "getx-theme", r = document.documentElement;
  try { var s = localStorage.getItem(K); if (s === "light" || s === "dark") r.setAttribute("data-theme", s); } catch (e) {}
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (!t) return;
    var n = r.getAttribute("data-theme") === "light" ? "dark" : "light";
    r.setAttribute("data-theme", n);
    try { localStorage.setItem(K, n); } catch (e) {}
  });
  if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
})();
