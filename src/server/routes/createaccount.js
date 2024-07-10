
const express = require('express');
const router = express.Router();
const path = require('path');

const createaccountController = require('../controllers/createaccountController')
const {getRegisterData, checkEmailAssociated, checkUsernameAssociated} = require('../controllers/createaccountController');

router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'createaccount.html'));
})

router.post('/', createaccountController.createNewMember);

// Data needed for the createaccount page, fetched from the script
router.get('/data', getRegisterData);
router.get('/username/:username', checkUsernameAssociated)
router.get('/email/:email', checkEmailAssociated)

module.exports = router;
