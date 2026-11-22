// Open the full export interface in its own tab. The popup closes so Chrome
// does not dismiss the export workflow when the user switches back to RTM.
document.getElementById('open').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('export.html') });
  window.close();
});
