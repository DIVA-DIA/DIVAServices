/**
 * Created by Marcel Würsch on 03.11.16.
 */
"use strict";

import * as fs from "fs-extra";
import * as _ from "lodash";
import * as mime from "mime";
import * as nconf from "nconf";
import * as path from "path";
import * as request from "request-promise";
import { isNullOrUndefined } from "util";
import { Logger } from "../logging/logger";
import { DivaError } from '../models/divaError';
import { DivaFile } from "../models/divaFile";
import { Process } from "../processingQueue/process";
import { IoHelper } from "./ioHelper";

/**
 * A class for all file handling 
 * 
 * @export
 * @class FileHelper
 */
export class FileHelper {

    /**
     * The JSON object holding all file information
     * 
     * @static
     * 
     * @memberOf FileHelper
     */

    static filesInfo = IoHelper.readFile(nconf.get("paths:imageInfoFile"));

    /**
     * 
     * @param path path to the file to check
     */
    static async fileExists(path: string): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            try {
                await fs.access(path);
                resolve(true);
            } catch (error) {
                resolve(false);
            }
        });

    }

    /**
     * Saves a file based on its base64 encoding
     * 
     * @static
     * @param {*} file  the file object containing the base64 string
     * @param {string} folder the folder to save the image into
     * @param {number} counter the running counter applied to this file
     * @param {string} [extension] the file extension (if available)
     * @returns {Promise<any>} 
     * @memberof FileHelper
     */
    static saveBase64(file: any, folder: string, counter: number, extension?: string): Promise<any> {
        return new Promise<any>(async (resolve, reject) => {
            let imagePath = nconf.get("paths:filesPath");
            //strip header information from the base64 string (necessary for Spotlight)
            let splitValues = file.value.split(',');
            let base64Data;
            if (splitValues.length > 1) {
                base64Data = splitValues[1];
            } else {
                base64Data = splitValues[0];
            }
            let fileObject = new DivaFile();
            let fileFolder = imagePath + path.sep + folder + path.sep + "original" + path.sep;
            let fileName = file.name;
            let fileExtension;
            if (!isNullOrUndefined(extension)) {
                fileExtension = extension;
            } else {
                fileExtension = this.getImageExtensionBase64(base64Data);
            }
            try {
                if (await IoHelper.fileExists(fileFolder + fileName)) {
                    resolve(file);

                } else {
                    fileObject.folder = fileFolder;
                    fileObject.filename = fileName;
                    fileObject.extension = fileExtension;
                    fileObject.path = fileFolder + fileName + "." + fileExtension;
                    await fs.writeFile(fileObject.path, base64Data, { encoding: "base64" });
                    resolve(fileObject);
                }
            } catch (error) {
                Logger.log("error", "error saving the image", "ImageHelper");
                return reject(new DivaError("Error while saving the image", 500, "FileError"));
            }
        });
    }

    /**
     * Saves an file stored within a JSON object
     * 
     * @static
     * @param {*} file the JSON object of the image
     * @param {Process} process the process of this image
     * @param {string} filename the filename of this image
     * 
     * @memberOf FileHelper
     */
    static async saveJson(file: any, process: Process, filename: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            let base64Data = file.replace(/^data:image\/png;base64,/, "");
            await fs.writeFile(process.outputFolder + path.sep + filename, base64Data, { encoding: "base64" });
            resolve();
        });
    }


    /**
     * Downloads a file from a given URL
     * 
     * @static
     * @param {string} url the URL pointing to a file
     * @param {string} filepath the filepath to save the file to
     * @returns {Promise<void>} 
     * @memberof FileHelper
     */
    static async downloadFile(url: string, filepath: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            request.get(url).pipe(fs.createWriteStream(filepath)).on("finish", function () {
                resolve();
            });
        });
    }

    /**
     * save a Zip file from a URL and unzip it
     * 
     * @static
     * @param {string} url the URL pointing to a zip file
     * @param {string} folder the folder to unzip the contents into
     * @returns {Promise<DivaFile[]>} an array of the unzipped files
     * @memberof FileHelper
     */
    static async saveZipUrl(url: string, folder: string): Promise<DivaFile[]> {
        return new Promise<DivaFile[]>(async (resolve, reject) => {
            try {
                let divaFiles: DivaFile[] = [];
                let filePath = nconf.get("paths:filesPath");
                let tmpFilePath: string = filePath + path.sep + folder + path.sep + "data.zip";
                await this.downloadFile(url, tmpFilePath);
                await IoHelper.unzipFile(tmpFilePath, filePath + path.sep + folder + path.sep + "original");
                let files: string[] = IoHelper.readFolder(filePath + path.sep + folder + path.sep + "original");
                let imageCounter: number = 0;
                for (var file of files) {
                    let divaFile = new DivaFile();
                    let filename = file.split(".").shift();
                    let base64 = fs.readFileSync(filePath + path.sep + folder + path.sep + "original" + path.sep + file, "base64");
                    divaFile.filename = filename;
                    divaFile.folder = filePath + path.sep + folder + path.sep + "original" + path.sep;
                    divaFile.extension = mime.getExtension(mime.getType(file));
                    divaFile.path = divaFile.folder + file;

                    await FileHelper.addFileInfo(divaFile.path, folder);
                    await FileHelper.updateCollectionInformation(folder, files.length, ++imageCounter);

                    divaFiles.push(divaFile);
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Download a file from a URL and save it on the filesystem
     * 
     * @static
     * @param {string} url the remote url of the image
     * @param {string} folder the local folder to store the image in
     * @param {number} counter the running counter that is assigned to this image
     * 
     * @memberOf FileHelper
     */
    static async saveFileUrl(url: string, folder: string, counter?: number, filename?: string, extension?: string): Promise<DivaFile> {
        return new Promise<DivaFile>(async (resolve, reject) => {
            try {
                let filePath = nconf.get("paths:filesPath");
                let file = new DivaFile();
                let tmpFilePath: string = "";
                let fileName: string = "";

                var headerResponse = await request.head(url);
                let fileExtension = "";
                if (!isNullOrUndefined(extension)) {
                    fileExtension = extension;
                } else {
                    if (headerResponse["content-type"] === "application/octet-stream") {
                        //if conte-typpe === 'application/content-stream' we can not make use of it per RFC 2616 7.2.1
                        // If the media type remains unknown, the recipient SHOULD treat it as type "application/octet-stream".
                        fileExtension = url.split(".").pop();
                    } else {
                        fileExtension = mime.getExtension(headerResponse["content-type"]);
                    }
                }
                if (filename != null) {
                    tmpFilePath = filePath + path.sep + "temp_" + filename + "." + fileExtension;
                    fileName = filename;
                } else if (counter != null) {
                    tmpFilePath = filePath + path.sep + "temp_" + counter + "." + fileExtension;
                    fileName = "input" + counter;
                }

                await this.downloadFile(url, tmpFilePath);

                let imgFolder = filePath + path.sep + folder + path.sep + "original" + path.sep;
                file.filename = fileName;
                file.folder = imgFolder;
                file.extension = fileExtension;
                file.path = imgFolder + fileName + "." + fileExtension;
                try {
                    await fs.stat(file.path);
                    fs.unlinkSync(tmpFilePath);
                } catch (error) {
                    if (error.code === "ENONENT") {
                        await fs.rename(tmpFilePath, file.path);
                        resolve(file);
                    }
                    if (error.code === "ENOENT") {
                        await fs.rename(tmpFilePath, file.path);
                        resolve(file);
                    }
                }
            } catch (error) {
                reject(error);
            }
        });

    }

    /**
     * Saves a text file onto the file system
     * @param data the textual data to save
     * @param folder the folder to save the file in
     * @param extension the file extension
     * @param counter the data element counter
     * @param filename the filename
     */
    static saveFileText(data: string, folder: string, extension: string, counter?: number, filename?: string): Promise<DivaFile> {
        let self = this;
        return new Promise<DivaFile>(async (resolve, reject) => {
            let filesPath = nconf.get("paths:filesPath");
            let filePath: string;
            let file = new DivaFile();
            let fileName: string = "";

            if (filename != null) {
                filePath = filesPath + path.sep + folder + path.sep + "original" + path.sep + filename + "." + extension;
                fileName = filename;
            } else if (counter != null) {
                filePath = filesPath + path.sep + folder + path.sep + "original" + path.sep + counter + "." + extension;
                fileName = String(counter);
            }

            await IoHelper.saveFile(filePath, data, "utf-8");

            let base64 = fs.readFileSync(filePath, "base64");

            let imgFolder = filePath + path.sep + folder + path.sep + "original" + path.sep;
            file.filename = fileName;
            file.folder = imgFolder;
            file.extension = extension;
            file.path = imgFolder + fileName + "." + extension;

            Logger.log("trace", "saved file", "FileHelper");
            resolve(file);
        });
    }


    /**
     * 
     * Get the name of all existing collections
     * 
     * @static
     * @returns {String[]} An array of collection names
     * 
     * @memberOf FileHelper
     */
    static getAllCollections(): String[] {
        let collections = [];

        let fileInfo: any = IoHelper.readFile(nconf.get("paths:imageInfoFile"));
        for (var file of fileInfo) {
            if (!(collections.indexOf(file.collection) > -1)) {
                collections.push(file.collection);
            }
        }
        return collections;
    }

    /**
     * Load specific files of a collection
     * 
     * @static
     * @param {string} collectionName The name of the collection
     * @returns {File[]} The array of loaded files
     * 
     * @memberOf FileHelper
     */
    static loadCollection(collectionName: string): DivaFile[] {
        let files: DivaFile[] = [];

        let filtered = null;

        filtered = _.filter(this.filesInfo, function (file: any) {
            return file.collection === collectionName;
        });
        if (filtered.length > 0) {
            for (let item of filtered) {
                let file = DivaFile.CreateFile(collectionName, path.basename(item.file));
                files.push(file);
            }
            return files;
        } else {
            Logger.log("error", "Tried to load collection: " + collectionName + " which does not exist", "ImageHelper");
            return [];
        }
    }

    /**
     * Save the information of an file into the file information file
     * 
     * @static
     * @param {string} file the filename of the file
     * @param {string} collection the collection the file belongs to
     * 
     * @memberOf FileHelper
     */
    static async addFileInfo(file: string, collection: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            this.filesInfo.push({ file: file, collection: collection });
            await this.saveFileInfo();
            resolve();
        });
    }

    /**
     * save the file information file
     * 
     * @static
     * 
     * @memberOf FileHelper
     */
    static async saveFileInfo() {
        await IoHelper.saveFile(nconf.get("paths:imageInfoFile"), this.filesInfo, "utf-8");
    }


    /**
     * create the information for a collection
     * 
     * @static
     * @param {string} collectionName the name of the collection
     * @param {number} files the number of files belonging to this collection
     * 
     * @memberOf FileHelper
     */
    static async createCollectionInformation(collectionName: string, files: number) {
        let status = {
            statusCode: 110,
            statusMessage: "Downloaded 0 of " + files + " files",
            percentage: 0,
            totalFiles: files
        };
        await IoHelper.saveFile(nconf.get("paths:filesPath") + path.sep + collectionName + path.sep + "status.json", status, "utf-8");
    }


    /**
     * Add more files to a collection
     * 
     * @static
     * @param {string} collectionName the name of the collection
     * @param {number} newFiles the number of new files
     * @memberof FileHelper
     */
    static async addFilesCollectionInformation(collectionName: string, newFiles: number) {
        let statusFile = nconf.get("paths:filesPath") + path.sep + collectionName + path.sep + "status.json";
        let currentStatus = await IoHelper.readFile(statusFile);

        currentStatus.statusCode = 110;
        currentStatus.statusMessage = "Downloaded " + currentStatus.totalFiles + " of " + (newFiles) + " files";
        currentStatus.percentage = (currentStatus.totalFiles) / (newFiles);
        currentStatus.totalFiles = (newFiles);

        await IoHelper.saveFile(nconf.get("paths:filesPath") + path.sep + collectionName + path.sep + "status.json", currentStatus, "utf-8");
    }

    /**
     * Deletes a collection from DIVAServices
     * 
     * @static
     * @param {string} collection the name of the collection to delete
     * @returns {Promise<void>} 
     * @memberof FileHelper
     */
    static async deleteCollection(collection: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            let files: DivaFile[] = this.loadCollection(collection);
            for (var file of files) {
                _.remove(this.filesInfo, function (item: any) {
                    return item.collection === collection;
                });
                Logger.log("info", "delete file" + file.path);
            }
            await this.saveFileInfo();
            await IoHelper.deleteFolder(nconf.get("paths:filesPath") + path.sep + collection);
            resolve();
        });
    }

    /**
     * Removes a single file from DIVAServices
     * 
     * @static
     * @param {DivaFile} file the file to remove
     * @returns {Promise<void>} 
     * @memberof FileHelper
     */
    static async deleteFile(file: DivaFile): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            _.remove(this.filesInfo, function (item: any) {
                return item.collection === file.collection;
            });
            await this.saveFileInfo();
            await IoHelper.deleteFile(file.path);
            resolve();
        });
    }


    /**
     * Removes a file in a collection
     * 
     * @static
     * @param {string} collection the collection the file is in
     * @param {string} target the filename of the file to delete 
     * @returns {Promise<void>} 
     * @memberof FileHelper
     */
    static async deleteFileInCollection(collection: string, target: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            let files: DivaFile[] = this.loadCollection(collection);
            for (var file of files) {
                if (file.filename === target) {
                    _.remove(this.filesInfo, function (item: any) {
                        return item.file === file.path;
                    });
                    Logger.log("info", "delete file" + file.path);
                }
            }
            await this.saveFileInfo();
            IoHelper.deleteFile(nconf.get("paths:filesPath") + path.sep + collection + path.sep + "original" + path.sep + target);
            resolve();
        });
    }

    /**
     * Check if a collection exists
     * 
     * @static
     * @param {string} collection the name of the collection
     * @returns {boolean} indicator whether or not the collection exists
     * 
     * @memberOf FileHelper
     */
    static checkCollectionAvailable(collection: string): boolean {
        try {
            fs.statSync(nconf.get("paths:filesPath") + path.sep + collection);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * update the collection information
     * 
     * @static
     * @param {string} collection the name of the collection
     * @param {number} files the total number of files in the collection
     * @param {number} downloaded the number of downloaded files
     * 
     * @memberOf ImageHelper
     */
    static async updateCollectionInformation(collection: string, files: number, downloaded: number): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            let status = {};
            if (downloaded !== files) {
                status = {
                    statusCode: 110,
                    statusMessage: "Downloaded " + downloaded + " of " + files + " files",
                    percentage: (downloaded / files) * 100,
                    totalFiles: files
                };
            } else {
                status = {
                    statusCode: 200,
                    statusMessage: "Collection is available",
                    percentage: 100,
                    totalFiles: files
                };
            }
            let statusFile = nconf.get("paths:filesPath") + path.sep + collection + path.sep + "status.json";
            await IoHelper.saveFile(statusFile, status, "utf-8");
            resolve();
        });
    }

    /**
     * Get information about a collection
     * 
     * @static
     * @param {string} collection the name of the collection
     * @returns {*} the file information for the collection
     * 
     * @memberOf ImageHelper
     */
    static getCollectionInformation(collection: string): any {
        let statusFile = nconf.get("paths:filesPath") + path.sep + collection + path.sep + "status.json";
        return IoHelper.readFile(statusFile);
    }

    /**
    * Get the image extension from a base64 string
    * 
    * @static
    * @param {string} base64 the base64 string
    * @returns {string} the file ending to use for the image type
    * 
    * @memberOf ImageHelper
    */
    static getImageExtensionBase64(base64: string): string {
        if (base64.indexOf("/9j/4AAQ") !== -1 || base64.indexOf("_9j_4AA") !== -1) {
            return "jpg";
        }
        if (base64.indexOf("iVBORw0KGgoAAAANSUhEU") !== -1) {
            return "png";
        }
    }
}