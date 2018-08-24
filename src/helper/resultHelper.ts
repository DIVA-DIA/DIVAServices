import { Collection } from '../processingQueue/collection';
import { IProcess } from '../processingQueue/iProcess';
import { Process } from '../processingQueue/process';
import { IoHelper } from './ioHelper';
import { ParameterHelper } from './parameterHelper';

/**
 * Created by Marcel Würsch on 04.11.16.
 */

"use strict";

/**
 * Helper class for all result related things
 * 
 * @export
 * @class ResultHelper
 */
export class ResultHelper {

    /**
     * load the results for a process / collection
     * 
     * @static
     * @param {IProcess} process the process to load results for
     * @returns {*}
     * 
     * @memberof ResultHelper
     */
    static loadResult(process: IProcess): any {
        return IoHelper.readFile(process.resultFile);
    }

    /**
     * save the results for a process / collection
     * 
     * @static
     * @param {IProcess} info the process to save results for
     * 
     * @memberof ResultHelper
     */
    static async saveResult(info: IProcess): Promise<any> {
        if (info instanceof Collection) {
            return await IoHelper.saveFile(info.resultFile, info.result, "utf8");
        } else {
            return await IoHelper.saveFile(info.tmpResultFile, info.result, "utf8");
        }
    }

    /**
     * delete the results for a process
     * 
     * @static
     * @param {Process} process the process to delete results for
     * 
     * @memberof ResultHelper
     */
    static async removeResult(process: Process): Promise<void> {
        await ParameterHelper.removeParamInfo(process);
        return IoHelper.deleteFolder(process.outputFolder);
    }
}