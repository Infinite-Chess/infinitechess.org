
/**
 * Fetches GitHub contributors and appends them to the document.
 */
(async function fetchGitHubContributors() {
	try {
		const githubContributors = document.querySelector(".github-container");
		if (!githubContributors) {
			console.warn("GitHub contributors container not found.");
			return;
		}

		const response = await fetch("/api/contributors");
		if (!response.ok) {
			throw new Error(`Failed to fetch contributors: ${response.statusText}`);
		}

		const contributors = await response.json();
		const fragment = document.createDocumentFragment();

		contributors.forEach((contributor) => {
			const link = document.createElement("a");
			link.href = contributor.linkUrl;

			const iconImg = document.createElement("img");
			iconImg.src = contributor.iconUrl;

			const githubStatsContainer = document.createElement("div");
			githubStatsContainer.className = "github-stats";

			const name = document.createElement("p");
			name.className = "name";
			name.innerText = contributor.name;

			const paragraph = document.createElement("p");
			paragraph.className = "contribution-count";
			paragraph.innerText = `${translations.contribution_count[0]}${contributor.contributionCount}${translations.contribution_count[1]}`;

			githubStatsContainer.appendChild(name);
			githubStatsContainer.appendChild(paragraph);
			link.appendChild(iconImg);
			link.appendChild(githubStatsContainer);
			fragment.appendChild(link);
		});

		githubContributors.appendChild(fragment);
	} catch (error) {
		console.error(`Error while loading contributor list: ${error}`);
	}
})();

