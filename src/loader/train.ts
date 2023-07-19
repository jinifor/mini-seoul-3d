import * as Cesium from 'cesium';
// @ts-ignore
import {Cartesian3, Entity, Viewer, JulianDate} from '@types/cesium';
import * as Turf from '@turf/turf';
import {Units} from "@turf/helpers";
import {Railway, RailwayInfo, Train, TimetablesInfo} from "../data/types";

import map from '../map'
import { Period } from '../utils/datetime'

import { SampledStationProperty } from '../utils/SampledStationProperty'
import {SampledBearingProperty} from "../utils/SampledBearingProperty";


type DataSet = {
    line?: string,
    railways?: Railway[],
    trains?: Train[]
}

export default (railwaysInfo: RailwayInfo[], timetablesInfo: TimetablesInfo[]) => {
    const lines = ["line1", "line2", "line7"]

    const dataSet: DataSet[] = [];


    lines.map(line => {
        const data: DataSet = {};
        data.line = line;
        railwaysInfo.map(r => {
            if (r.line === line) data.railways = r.railways;
        })
        timetablesInfo.map(t => {
            if (t.line === line) data.trains = t.trains;
        })
        dataSet.push(data);
    })
    return dataSet;
}

export function trainsWorker(data: DataSet) {

    // @ts-ignore
    const worker = new Worker(new URL('../worker/trainWorker.js', import.meta.url), {
        type: 'module',
    })
    const datasource = map.findDataSourceByName(map.DATASOURCE_NAME.TRAIN);

    worker.onmessage = function (event) {
        const entities = event.data;
        entities.map(entity => {
            const entityPosition =  new Cesium.SampledPositionProperty();
            const entityStation = new SampledStationProperty();
            const entityBearing = new SampledBearingProperty();

            entity.positions.map(position => {
                const time = Cesium.JulianDate.fromDate(new Date(position.time));
                const point = Cesium.Cartesian3.fromDegrees(position.location[0], position.location[1])
                entityPosition.addSample(time, point);
            })

            entity.stations.map(station => {
                entityStation.addSample( new Period(station.startDatetime, station.endDatetime), station.info);
            })

            entity.angles.map(angle => {
                entityBearing.addSample( new Period(angle.startDatetime, angle.endDatetime), angle.angle);
            })
            const newEntity = {
                id: entity.trainNo,
                position: entityPosition,
                orientation: new Cesium.VelocityOrientationProperty(entityPosition),
                description: {
                    'station': entityStation,
                    'bearing': entityBearing,
                },
                model: {
                    uri: `./data/${line}.glb`,
                    scale: new Cesium.CallbackProperty(map.getSizeByZoom, false),
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                },
            };
            datasource.entities.add(newEntity);
        });

    };

    const { line, trains, railways } = data;
    worker.postMessage({ line, trains, railways });
}
