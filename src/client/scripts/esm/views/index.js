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
			paragraph.innerText = `${contributor.name}\n${contributor.contributionCount} contributions`;

			div.appendChild(paragraph);
			link.appendChild(img);
			link.appendChild(div);
			githubContributors.appendChild(link);
		});
	});
});