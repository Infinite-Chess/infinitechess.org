const { DEV_BUILD } = require('../config/config');
const { generateAccount } = require('../controllers/createaccountController');
const { giveRole_Owner, giveRole_Patron } = require('../controllers/roles');
const { doesMemberExist } = require('../controllers/members');
const { ensureEnvFile } = require('../config/env')

function initDevEnvironment() {
    if (!DEV_BUILD) return; // Production
    
    ensureEnvFile();
    createDevelopmentAccounts();
}

function createDevelopmentAccounts() {
    if (!doesMemberExist("owner")) {
        generateAccount({ username: "Owner", email: "exampleemail@gmail.com", password: "1", autoVerify: true })
        giveRole_Owner("owner", "developmental account")
    }
    if (!doesMemberExist("patron")) {
        generateAccount({ username: "Patron", email: "exampleemail@gmail.com", password: "1", autoVerify: true })
        giveRole_Patron("patron", "developmental account")
    }
}


module.exports = {
    initDevEnvironment
}