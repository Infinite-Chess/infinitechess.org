
/**
 * This script provides functionalities for the username container that contains the players' username, elo etc.
 */



// Types ----------------------------------------------------------------------------------------


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
    makehyperlink?: boolean,
	/** Hyperlink target. By default, '_blank' is used. */
	hyperlinktarget?: string,
    /** Whether to show the displayrating entry if it exists */
    showrating?: boolean
}


// General functions ----------------------------------------------------------------------------------------


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
		usernameDiv.target = options?.hyperlinktarget !== undefined ? options.hyperlinktarget : '_blank';
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

/**
 * Set child_element as the only content of parent_element, with the same classes and styling
 * @param child_element 
 * @param parent_element 
 */
function embedUsernameContainerDisplayIntoParent(child_element: HTMLDivElement, parent_element: HTMLElement) {
	// First clear all other content of parent_element
	while (parent_element.firstChild) {
		parent_element.removeChild(parent_element.firstChild);
	}

	// styling: make child inherit all classes of parent_element
	child_element.className = parent_element.className;

	// append child to parent
	parent_element.appendChild(child_element);
}


// Invite-text specific functions ----------------------------------------------------------------------------------------


/**
 * Parse a UsernameContainer object into a text string, as it should appear on an invite
 */
function parseUsernameContainerToInviteText(usernamecontainer: UsernameContainer) : string {
	return usernamecontainer?.displayrating === undefined ? usernamecontainer.username : `${usernamecontainer.username} (${usernamecontainer.displayrating})`;
}

/**
 * Parse a text string appearing on an invite into a UsernameContainer object
 */
function parseInviteTextToUsernameContainer(text: string) : UsernameContainer {
	const elo_index = text.search(/\(?-?[0-9]/);
	if (elo_index === -1) return {username: text}; // contains no display elo
	else return { // contains display elo
		username: text.slice(0, elo_index).trimEnd(),
		displayrating: text.slice(elo_index).replace(/[()]/g, "")
	};
}


export default {
	createUsernameContainerDisplay,
	embedUsernameContainerDisplayIntoParent,
	parseUsernameContainerToInviteText,
	parseInviteTextToUsernameContainer
};

export type {
	UsernameContainer,
	UsernameContainerDisplayOptions
};