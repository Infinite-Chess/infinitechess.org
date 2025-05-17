/**
 * This script provides functionalities for the username container that contains the players' username, elo etc.
 */

/**
 * Such an object contains all display information for a given user
 */
type UsernameContainer = {
	username: string,
	displayrating?: string | null
}

/**
 * Settings for creating HTML elements out of username containers
 */
type UsernameContainerDisplayOptions = {
    /** Whether to make the username a clickable hyperlink */
    makehyperlink?: boolean
    /** Whether to show the displayrating entry if it exists */
    showrating?: boolean
}

/**
 * Creates an HTML Div Element containing all information to be shown about a UsernameContainer
 * @param usernamecontainer - contains information for a given user
 * @param options - settings for how to display information
 * @returns HTMLDivElement
 */
function createUsernameContainerDisplay(usernamecontainer: UsernameContainer, options: UsernameContainerDisplayOptions = {}) : HTMLDivElement {
	const containerDiv = document.createElement('div');
    
	// username element
	if (options?.makehyperlink) {
		const usernameDiv = document.createElement('a');
		usernameDiv.href = `/member/${usernamecontainer.username}`;
		usernameDiv.textContent = usernamecontainer.username;
		usernameDiv.target = '_blank';
		containerDiv.appendChild(usernameDiv);
	}
	else {
		const usernameDiv = document.createElement('div');
		usernameDiv.textContent = usernamecontainer.username;
		containerDiv.appendChild(usernameDiv);
	}

	// rating element
	if (options?.showrating && usernamecontainer?.displayrating !== undefined && usernamecontainer?.displayrating !== null ) {
		const eloDiv = document.createElement('div');
		eloDiv.textContent = usernamecontainer.displayrating;
		containerDiv.appendChild(eloDiv);
	}

	return containerDiv;
}



export default {
	createUsernameContainerDisplay
};

export type {
	UsernameContainer,
	UsernameContainerDisplayOptions
};