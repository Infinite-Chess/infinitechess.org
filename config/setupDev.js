const { DEV_BUILD } = require('../config/config');
const { generateAccount } = require('../src/server/controllers/createaccountController');
const { giveRole_Owner, giveRole_Patron } = require('../src/server/controllers/roles');
const { doesMemberExist } = require('../src/server/controllers/members');
const { ensureEnvFile } = require('../config/env');
const { ensureSelfSignedCertificate } = require('./generateCert');

function initDevEnvironment() {
    if (!DEV_BUILD) return callDotenvConfig(); // Production
    
    ensureEnvFile();
    callDotenvConfig();

    if (ensureSelfSignedCertificate()) { 
        // Let's also display the url to the page!
        // console.log(`Website is hosted at https://localhost:${process.env.HTTPSPORT_LOCAL}/`);
    }
    createDevelopmentAccounts();
}

function callDotenvConfig() {
    // Load the .env file contents into process.env
    // This needs to be as early as possible
    require('dotenv').config(); 
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
    if (!doesMemberExist("member")) {
        generateAccount({ username: "Member", email: "exampleemail@gmail.com", password: "1", autoVerify: true })
    }
}


module.exports = {
    initDevEnvironment
}
