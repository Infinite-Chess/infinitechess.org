const commandInput = document.getElementById("commandInput")! as HTMLInputElement;
const commandHistory = document.getElementById("commandHistory")! as HTMLTextAreaElement;
const sendCommandButton = document.getElementById("sendButton")! as HTMLButtonElement;

async function sendCommand() {
	const commandString: string = commandInput.value;
	commandInput.value = "";
	const response = await fetch("command/" + commandString);
	commandHistory.textContent += commandString + '\n' + await response.text() + "\n\n";
}

sendCommandButton.addEventListener("click", sendCommand);