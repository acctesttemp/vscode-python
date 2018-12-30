// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as dotenv from 'dotenv';
import * as fs from 'fs-extra';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import { IPathUtils } from '../types';
import { EnvironmentVariables, IEnvironmentVariablesService } from './types';

@injectable()
export class EnvironmentVariablesService implements IEnvironmentVariablesService {
    private readonly pathVariable: 'PATH' | 'Path';
    constructor(@inject(IPathUtils) pathUtils: IPathUtils) {
        this.pathVariable = pathUtils.getPathVariableName();
    }
    public async parseFile(filePath?: string): Promise<EnvironmentVariables | undefined> {
        if (!filePath || !await fs.pathExists(filePath)) {
            return;
        }
        if (!fs.lstatSync(filePath).isFile()) {
            return;
        }
        // return dotenv.parse(await fs.readFile(filePath));
        // Manual work around parse .env to keep old value from overide env declare
        let envsMap = new Map();
        let lines = fs.readFileSync(filePath).toString().split(/(?:\r\n|\r|\n)/g);
        for (const line of lines) {
            if (line === "" || line.startsWith("#")) continue;
            let [newKey, value] = line.split("=");
            for (const envKey of envsMap.keys()) {
                // Expand value of newKey with pre exist keys
                let expandValue = envsMap.get(envKey);
                let matchEnvInValue = "[\$%!](" + envKey + ")[\\/%!]";
                let re = new RegExp(matchEnvInValue, "gi");
                value = value.replace(re, expandValue);
            }
            if (envsMap.has(newKey)) {
                // Remove old exist key
                envsMap.delete(newKey);
            }
            envsMap.set(newKey, value);
        };
        const envs = {};
        envsMap.forEach((v,k) => { envs[k] = v });
        return envs;
    }
    public mergeVariables(source: EnvironmentVariables, target: EnvironmentVariables) {
        if (!target) {
            return;
        }
        const settingsNotToMerge = ['PYTHONPATH', this.pathVariable];
        Object.keys(source).forEach(setting => {
            if (settingsNotToMerge.indexOf(setting) >= 0) {
                return;
            }
            if (target[setting] === undefined) {
                target[setting] = source[setting];
            }
        });
    }
    public appendPythonPath(vars: EnvironmentVariables, ...pythonPaths: string[]) {
        return this.appendPaths(vars, 'PYTHONPATH', ...pythonPaths);
    }
    public appendPath(vars: EnvironmentVariables, ...paths: string[]) {
        return this.appendPaths(vars, this.pathVariable, ...paths);
    }
    private appendPaths(vars: EnvironmentVariables, variableName: 'PATH' | 'Path' | 'PYTHONPATH', ...pathsToAppend: string[]) {
        const valueToAppend = pathsToAppend
            .filter(item => typeof item === 'string' && item.trim().length > 0)
            .map(item => item.trim())
            .join(path.delimiter);
        if (valueToAppend.length === 0) {
            return vars;
        }

        const variable = vars ? vars[variableName] : undefined;
        if (variable && typeof variable === 'string' && variable.length > 0) {
            vars[variableName] = variable + path.delimiter + valueToAppend;
        } else {
            vars[variableName] = valueToAppend;
        }
        return vars;
    }
}
