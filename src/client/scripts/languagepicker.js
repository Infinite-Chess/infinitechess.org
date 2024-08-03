// This script is used for the translation process of the website into different languages.
// It is inserted into the footer of every EJS page.
// The currently selected language by the user is stored as a cookie in the user's browser.

{
  const language_picker = document.getElementById("language-picker");

  function getCookieValue(cookieName) {
    const cookieArray = document.cookie.split("; ");

    for (let i = 0; i < cookieArray.length; i++) {
      const cookiePair = cookieArray[i].split("=");
      if (cookiePair[0] === cookieName) {
        return cookiePair[1];
      }
    }
    return undefined;
  }

  function updateCookie(cookieName, value, days) {
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = cookieName + "=" + (value || "") + expires + "; path=/";
  }

  // Request cookie if doesn't exist
  if (getCookieValue("i18next") === undefined) {
    fetch("/setlanguage", {
      method: "POST",
      credentials: "same-origin",
    });
  }

  language_picker.addEventListener("change", () => {
    const selectedLanguage = language_picker.value;
    updateCookie("i18next", selectedLanguage, 365);

    // Modify the URL to include the "lng" query parameter
    const url = new URL(window.location);
    url.searchParams.set("lng", selectedLanguage);

    // Update the browser's URL without reloading the page
    window.history.replaceState({}, '', url);

    // Reload the page
    location.reload();
  });
}
