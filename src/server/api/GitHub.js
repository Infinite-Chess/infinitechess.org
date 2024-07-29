
/*
 * This module, in the future, where be where we connect to GitHub's API
 * to dynamically refresh a list of github contributors on the webiste,
 * probably below our patron donors.
 */


/** A list of contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org).
 * This should be periodically refreshed. */
const contributors = [];

/** The interval, in milliseconds, to use GitHub's API to refresh the contributor list. */
const intervalToRefreshContributorsMillis = 1000 * 60 * 60; // 1 hour

/**
 * Uses GitHub's API to fetch all contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org),
 * and updates our list!
 * 
 * STILL TO BE WRITTEN
 */
function refreshGitHubContributorsList() {

}

/**
 * Returns a list of contributors on the infinitechess.org [repository](https://github.com/Infinite-Chess/infinitechess.org),
 * updated every {@link intervalToRefreshContributorsMillis}.
 * @returns {string[]}
 */
function getContributors() { return contributors; }


module.exports = {
    getContributors
}