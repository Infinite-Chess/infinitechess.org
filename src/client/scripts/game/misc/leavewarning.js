// This script is used to display warning message when trying to leave active game.

"use strict";

const leavewarning = (function () {
  window.addEventListener("beforeunload", function (event) {
    if (game.areInActiveGame()) {
      event.preventDefault();
    }
  });
})();
