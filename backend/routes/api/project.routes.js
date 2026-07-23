const express=require('express');
const router=express.Router()
const auth=require('../../middleware/auth')
const projectControllers=require('../../controllers/project.controller')


router.get('/:id',auth,projectControllers.getProjectById);
router.get('/',auth,projectControllers.getAllProjects);


router.post('/',auth,projectControllers.createProject);
router.post('/analyzeRepo',auth,projectControllers.analyzeProject)
router.post('/index',auth,projectControllers.indexProject)

module.exports=router