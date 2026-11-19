// Entry point for the extension's popup.
// The test button checks that the popup JavaScript is running.

function showStatus(message) {
  document.getElementById('status').textContent = message;
}

function testExtension() {
  showStatus('Extension is working.');
}

document.getElementById('check').addEventListener('click', testExtension);
