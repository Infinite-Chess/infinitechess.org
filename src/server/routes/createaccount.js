
const express = require('express');
const router = express.Router();
const path = require('path');

const createaccountController = require('../controllers/createaccountController')
const { getRegisterData, checkEmailAssociated, checkUsernameAvailable } = require('../controllers/createaccountController');
const { getLanguageToServe } = require("../config/setupTranslations")



router.get('/', (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(path.join(__dirname, '..', '..', '..', 'dist', 'views', language, 'createaccount.html'));
})

router.post('/', createaccountController.createNewMember);

// Data needed for the createaccount page, fetched from the script
router.get('/data', getRegisterData);
router.get('/username/:username', checkUsernameAvailable)
router.get('/email/:email', checkEmailAssociated)

module.exports = router;
