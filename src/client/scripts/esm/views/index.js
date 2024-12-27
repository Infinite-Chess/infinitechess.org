const githubContributors = document.getElementsByClassName("github-container")[0];

const res = fetch("/api/contributors");
res.then(function(contributors) {
	contributors.json().then(function(json) {
		console.log(json);
		json.forEach(contributor => {
			const link = document.createElement('a');
			link.href = contributor.linkUrl;

			const img = document.createElement('img');
			img.src = contributor.iconUrl;

			const div = document.createElement('div');
			div.className = 'github-stats';

			const paragraph = document.createElement('p');
			const contributionText = `${translations.contribution_count[0]} ${contributor.contributionCount} ${translations.contribution_count[1]}`;
			paragraph.innerText = `${contributor.name}\n${contributionText}`;

			div.appendChild(paragraph);
			link.appendChild(img);
			link.appendChild(div);
			githubContributors.appendChild(link);
		});
	});
});