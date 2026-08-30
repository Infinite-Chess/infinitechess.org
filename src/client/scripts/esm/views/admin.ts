// src/client/scripts/esm/views/admin.ts

/**
 * The admin page's command console. Posts typed commands to /api/admin/command
 * and appends the server's reply to the history box.
 */

const commandInput = document.getElementById('commandInput')! as HTMLInputElement;
const commandHistory = document.getElementById('commandHistory')! as HTMLTextAreaElement;
const sendCommandButton = document.getElementById('sendButton')! as HTMLButtonElement;

async function sendCommand(): Promise<void> {
	const commandString: string = commandInput.value;
	if (commandString.length === 0) return; // Don't send command if the input box is empty
	commandInput.value = '';
	const response = await fetch('/api/admin/command', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ command: commandString }),
	});
	commandHistory.textContent += commandString + '\n' + (await response.text()) + '\n\n';
	scrollToBottom(commandHistory);
}

function clickSubmitIfReturnPressed(event: KeyboardEvent): void {
	if (event.key === 'Enter') sendCommandButton.click();
}

/**
 * Automatically scrolls to the bottom of the container.
 * @param container - The container to scroll.
 */
function scrollToBottom(container: HTMLElement): void {
	container.scrollTo({
		top: container.scrollHeight,
		behavior: 'smooth',
	});
}

sendCommandButton.addEventListener('click', sendCommand);
commandInput.addEventListener('keyup', clickSubmitIfReturnPressed);
