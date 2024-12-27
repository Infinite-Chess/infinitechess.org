const githubContributors = document.getElementsByClassName("github-container")[0];

const res = fetch("/api/contributors");
res.then(function(contributors) {
	contributors.json().then(function(json) {
		json.forEach(contributor => {
			const link = document.createElement('a');
			const iconImg = document.createElement('img');
			const githubStatsContainer = document.createElement('div');
			githubStatsContainer.className = 'github-stats';
			const paragraph = document.createElement('p');
			
			const contributionText = `${translations.contribution_count[0]} ${contributor.contributionCount} ${translations.contribution_count[1]}`;
			link.href = contributor.linkUrl;
			iconImg.src = contributor.iconUrl;
			paragraph.innerText = `${contributor.name}\n${contributionText}`;

			githubStatsContainer.appendChild(paragraph);
			link.appendChild(iconImg);
			link.appendChild(githubStatsContainer);
			githubContributors.appendChild(link);
		});
	});
});
res.catch(function(reason) {
	console.warn("COULD NOT LOAD CONTRIBUTOR LIST");
	console.error(reason);
});