
import * as express from 'express';
import * as nconf from "nconf";
import { DivaError } from '../models/divaError';
import { QueueHandler } from '../processingQueue/queueHandler';
import { WorkflowManager } from '../workflows/workflowManager';
import { PostHandler } from './postHandler';
import { Logger } from "../logging/logger";
import { ServicesInfoHelper } from "../helper/servicesInfoHelper";
import { AlgorithmManagement } from "../management/algorithmManagement";

"use strict";

let router = express.Router();

/**
 * Installing a new workflow
 */
router.post("/workflows", async function (req: express.Request, res: express.Response) {
    try {
        //schema to check against
        let workflowManager = new WorkflowManager(req.body);
        await workflowManager.parseWorkflow();
        await workflowManager.createServicesEntry();
        await workflowManager.createInfoFile();
        await workflowManager.updateRootFile();

        //create the status 
        // let status = await workflowManager.getStatus();

        // let response = {
        //     statusCode: status.status.statusCode,
        //     identifier: status.identifier,
        //     statusMessage: status.statusMessage
        // };

        send200(res, {});
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * Execute a workflow
 */
router.post("/workflows/*", async function (req: express.Request, res: express.Response) {
    try {
        let response = await PostHandler.handleRequest(req);
        response["statusCode"] = 202;
        send200(res, response);
        QueueHandler.executeDockerRequest();
    } catch (error) {
        sendError(res, error);
    }
});


/**
 * delete an existing workflow
 */
router.delete("/workflows/:workflowName/:version", async function (req: express.Request, res: express.Response) {
    // We use the already existing static methods of the algorithmMangager (could be don in a generic util class)
    let serviceInfo = await ServicesInfoHelper.getInfoByPath("/workflows/" + req.params.workflowName + "/" + req.params.version);
    //selete algo info from the service file
    AlgorithmManagement.removeFromServiceInfoFileByidentifier(serviceInfo.identifier);

    //remove the whole worlflows/workflowName folder and also the log/workflow/workflowName and json/workflows/workflowName folder
    WorkflowManager.delteWorkflowFolders(req.params.workflowName);
    //remove /route/info.json file
    AlgorithmManagement.deleteInfoFile(nconf.get("paths:jsonPath") + "/workflows" + serviceInfo.path);
    AlgorithmManagement.removeFromRootInfoFile(serviceInfo.path);
    send200(res, {"message": "Workflow " + req.params.workflowName + " sucessfully deleted!"});
    Logger.log("info", "deleted workflow " + req.params.workflowName, "WorkflowRouter");
});


function send200(res: express.Response, response: any) {
    res.status(200);
    try {
        let resp = JSON.parse(response);
        res.json(resp);
    } catch (error) {
        res.json(response);
    }
    res.send()
}

function sendError(res: express.Response, error: DivaError) {
    res.status(error.statusCode || 500);
    res.json({ message: error.message, errorType: error.errorType });
}

export = router;