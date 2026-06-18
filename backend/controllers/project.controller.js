const { STATUS_CODE } = require("../utils/constants");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/response");
const Joi = require("joi");
const Project = require("../models/projects");
const projectServices = require("../services/project.service");
const {submissionQueue} = require("../utils/queue");

async function createProject(req, res) {
    const projectSchema = Joi.object({
        name: Joi.string().required(),
        description: Joi.string().required(),
    });
    try {
        const { error, value } = projectSchema.validate(req.body);
        if (error) {
            return sendErrorResponse(
                res,
                error?.message,
                "Validation error",
                STATUS_CODE.BAD_REQUEST,
            );
        }
        const { name, description, githubLink } = value;
        const userId = req.user.id;

        const newProject = await projectServices.createProject({
            name,
            description,
            userId,
        });
        return sendSuccessResponse(
            res,
            newProject,
            "Project created successfully",
            STATUS_CODE.CREATED,
        );
    } catch (err) {
        console.error("Error creating project:", err);
        return sendErrorResponse(
            res,
            err,
            "Internal Server Error",
            STATUS_CODE.SERVER_ERROR,
        );
    }
}

async function analyzeProject(req, res) {
    const githubRepoRegex = /^https:\/\/(www\.)?github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+\/?$/;
    const analyzeSchema = Joi.object({
        githubUrl: Joi.string().
            uri().
            regex(githubRepoRegex).
            required()
            .messages({
                'string.uri': 'The link must be a valid URL.',
                'string.pattern.base': 'The link must be a valid GitHub repository URL'
            }),
        projectId: Joi.string().required()
    })

    try {
        const { error, value } = analyzeSchema.validate(req.body);
        if (error) {
            return sendErrorResponse(
                res,
                error?.message,
                "Validation error",
                STATUS_CODE.BAD_REQUEST,
            );
        }
        const { githubUrl, projectId } = value;

        const analysisResult = await projectServices.analyzeProject(githubUrl);

        

        if(analysisResult.scopes.length>0) {
            // Save the indexed paths to the project
            await Project.findByIdAndUpdate(
                req.body.projectId,
                {indexedPaths: analysisResult.scopes,
                githubLink: githubUrl
                 },
                { new: true }
            );
        }
        return sendSuccessResponse(
            res,
            analysisResult,
            `Project analysis for ${githubUrl} has been initiated. Results will be available shortly.`,
            STATUS_CODE.ACCEPTED,
        );

    } catch (err) {
        console.error("Error analyzing project:", err);
        return sendErrorResponse(
            res,
            err,
            "Internal Server Error",
            STATUS_CODE.SERVER_ERROR,
        );
    }
}

async function indexProject(req, res) {
    const projectSchema = Joi.object({
        projectId: Joi.string().required()
    });
    const { error, value } = projectSchema.validate(req.body);
    if (error) {
        return sendErrorResponse(
            res,
            error?.message,
            "Validation error",
            STATUS_CODE.BAD_REQUEST,
        );
    }
try{
    const {projectId } = value;
    const userId=req.user.id;

    
    const fetchedProject= await projectServices.getProjectById(projectId,userId);

    const queueWork= await submissionQueue.add('indexProject', { project: fetchedProject});

    return sendSuccessResponse(
        res,
        fetchedProject,
        "Project indexing has been initiated. Results will be available shortly.",
        STATUS_CODE.ACCEPTED
    );

}catch(err){
    console.error("Error indexing project:", err);
    return sendErrorResponse(
        res,
        err,
        "Internal Server Error",
        STATUS_CODE.SERVER_ERROR,
    );
}
}

async function getProjectById(req, res){
    const projectSchema = Joi.object({
        id: Joi.string().required()
    });
    try{
        const { error, value } = projectSchema.validate(req.params);
        if (error) {
            return sendErrorResponse(
                res,
                error?.message,
                "Validation error",
                STATUS_CODE.BAD_REQUEST
            );
        }
        const { id: projectId } = value;
        
        const userId = req.user.id;
        const fetchProject= await projectServices.getProjectById(projectId, userId);

        
        return sendSuccessResponse(
            res,
            fetchProject,
            "Project fetched successfully",
            STATUS_CODE.SUCCESS
        );
    }catch(err){
        
        return sendErrorResponse(
            res,
            err,
            "Internal Server Error",
            STATUS_CODE.SERVER_ERROR,
        );
    }
}

module.exports = {
    createProject,
    analyzeProject,
    indexProject,
    getProjectById
};
