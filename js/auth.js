(function () {
  var form = document.getElementById("auth-form");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    window.location.href = "./editor.html";
  });
})();
