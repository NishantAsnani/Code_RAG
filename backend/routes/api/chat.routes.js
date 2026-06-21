const express=require('express');
const router=express.Router()
const auth=require('../../middleware/auth')
const chatControllers=require('../../controllers/chat.controller')

router.post('/test',chatControllers.testEndpoint)
router.post('/',auth,chatControllers.askQuestion)

module.exports=router