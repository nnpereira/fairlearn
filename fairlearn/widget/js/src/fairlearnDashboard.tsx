import { DOMWidgetModel, DOMWidgetView } from '@jupyter-widgets/base';
import { FairnessWizard } from 'fairlearn-dashboard';
import * as _ from 'lodash';
import React from 'react';
import ReactDOM from 'react-dom';

// Custom Model. Custom widgets models must at least provide default values
// for model attributes, including
//
//  - `_view_name`
//  - `_view_module`
//  - `_view_module_version`
//
//  - `_model_name`
//  - `_model_module`
//  - `_model_module_version`
//
//  when different from the base class.

// When serialiazing the entire widget state for embedding, only values that
// differ from the defaults will be specified.
export class  FairlearnModel extends DOMWidgetModel {
    defaults() {
        return {
            _model_name : 'FairlearnModel',
            _view_name : 'FairlearnView',
            _model_module : 'fairlearn-widget',
            _view_module : 'fairlearn-widget',
            _model_module_version : '0.1.0',
            _view_module_version : '0.1.0',
            value: {},
            request: {},
            response: {}
        }
    }
};

interface IPromiseResolvers {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: number;
}

// Custom View. Renders the widget model.
export class FairlearnView extends DOMWidgetView {
    el: any;
    private requestIndex: number = 0;
    private promiseDict: {[key: number]: IPromiseResolvers} = {};

    public render() {
        this.el.style.cssText = "width: 100%";
        let root_element = document.createElement("div");
        root_element.style.cssText = "width: 100%;";
        this.model.on('change:response', this.resolvePromise, this);
        const data = this.model.get('value');
        ReactDOM.render(<FairnessWizard
            dataSummary={{featureNames: data.features, classNames: data.classes}}
            testData={data.dataset}
            predictedY={data.predicted_ys}
            trueY={data.true_y}
            supportedClassificationAccuracyKeys={data.classification_methods}
            supportedRegressionAccuracyKeys={data.regression_methods}
            requestMetrics={this.makeRequest.bind(this)}
            predictionType={data.is_classifier === false ? "regression" : undefined}
        />, root_element);
        this.el.appendChild(root_element)
    }

    private makeRequest(data: any, abortSignal?: AbortSignal): Promise<any> {
        const promise = new Promise<any>((resolve, reject) => {
            const requestIndex = this.requestIndex;
            this.requestIndex++;
            // handle timeout (set to 3 minutes)
            const timeout = window.setTimeout(() => {
                if (this.promiseDict[requestIndex]){
                    this.promiseDict[requestIndex].reject(new DOMException('Timeout: took longer than 3 minutes to process', 'TimeoutError'));
                    delete this.promiseDict[requestIndex];
                }
            }, 180000);
            this.promiseDict[requestIndex] = {resolve, reject, timeout};
            this.model.set('request', {id: requestIndex, data});
            this.touch();

            // handle abort
            if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                    clearTimeout(timeout);
                    reject(new DOMException('Aborted', 'AbortError'));
                    delete this.promiseDict[requestIndex];
                });
            }
        })
        return promise;
    }

    private resolvePromise(): void {
        const response = this.model.get('response');
        if (response === undefined || response.id === undefined) {
            return;
        }
        const promise = this.promiseDict[response.id];
        if (promise === undefined) {
            return;
        }
        if (response.data === undefined) {
            promise.reject('Null response');
        }
        else if (response.error !== undefined) {
            promise.reject(new DOMException(response.error, 'PythonError'));
        }
        else {
            promise.resolve(response.data);
        }
        clearTimeout(promise.timeout);
        delete this.promiseDict[response.id];
    }
};
