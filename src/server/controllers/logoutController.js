
const { findMemberFromRefreshToken, deleteRefreshToken, getUsernameCaseSensitive } = require('./members');
const websocketserver = require('../wsserver')
const { deleteAllInvitesOfMember } = require('../game/invitesmanager/invitesmanager');
const { getTranslationForReq } = require('../config/setupTranslations');

const handleLogout = async (req, res) => {
    // On client, also delete the accessToken

    const cookies = req.cookies;
    // We need to delete refresh token cookie, but is it already?
    if (!cookies?.jwt) return res.redirect('/'); // Success, already logged out
    const refreshToken = cookies.jwt;

    // Is refreshToken in db?
    const foundMemberKey = findMemberFromRefreshToken(refreshToken)
    if (!foundMemberKey) return res.status(409).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_not_found", req) }); // Forbidden

    // Delete refreshToken in db.
    // This also saves the members file.
    deleteRefreshToken(foundMemberKey, refreshToken);

    websocketserver.closeAllSocketsOfMember(foundMemberKey, 1008, "Logged out")
    deleteAllInvitesOfMember(foundMemberKey);

    console.log(`Logged out member ${getUsernameCaseSensitive(foundMemberKey)}`)
    res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: true });

    res.redirect('/');
}

module.exports = { handleLogout }
