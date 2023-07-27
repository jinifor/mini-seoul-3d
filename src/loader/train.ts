import * as Cesium from 'cesium';
// @ts-ignore
import {Cartesian3, Entity, Viewer, JulianDate} from '@types/cesium';
import {Railway, RailwayInfo, Train, TimetablesInfo} from "../data/types";

import map from '../map'
import { Period } from '../utils/datetime'

import { SampledStationProperty } from '../utils/SampledStationProperty'
import {SampledBearingProperty} from "../utils/SampledBearingProperty";

type DataSet = {
    line: string,
    railways: Railway[],
    trains: Train[]
}

export default (railwaysInfo: RailwayInfo[], timetablesInfo: TimetablesInfo[]) => {
    const lines = railwaysInfo.map(r => r.line);

    const dataSet: DataSet[] = [];

    lines.map(line => {
        const data: DataSet = {
            line: "",
            railways: [],
            trains: []
        };
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

export function trainsWorker(data: DataSet[], resolve) {

    const dataLength = data.length;

    let processed = 1;

    for(let i = 0; i < dataLength; i++) {
        const { line, trains, railways } = data[i];

        const datasource = map.findDataSourceByName(map.DATASOURCE_NAME.TRAIN);

        // @ts-ignore
        const angleWorker = new Worker(new URL('../worker/angleWorker.js', import.meta.url), {
            type: 'module',
        });

        angleWorker.onmessage = function (event) {
            const entities = event.data;
            entities.map(entity => {
                const id = getTrainEntityId(line, entity.trainNo);
                const viewerEntity = datasource.entities.getById(id);
                const entityBearing = new SampledBearingProperty();
                if (viewerEntity) {
                    entity.angles.map(angle => {
                        entityBearing.addSample( new Period(angle.startDatetime, angle.endDatetime), angle.angle);
                    })
                    viewerEntity.addProperty('bearing');
                    viewerEntity.bearing = entityBearing;
                }
            });
            processed += 1;
            if(processed == dataLength) {
                console.log("Whole Worker finished!!")
                resolve();
            }
        }

        // @ts-ignore
        const trainWorker = new Worker(new URL('../worker/trainWorker.js', import.meta.url), {
            type: 'module',
        });

        trainWorker.onmessage = function (event) {
            const entities = event.data;
            entities.map(entity => {
                const entityPosition =  new Cesium.SampledPositionProperty();
                const entityStation = new SampledStationProperty();

                entity.positions.map(position => {
                    const time = Cesium.JulianDate.fromDate(new Date(position.time));
                    const point = Cesium.Cartesian3.fromDegrees(position.location[0], position.location[1])
                    entityPosition.addSample(time, point);
                })

                entity.stations.map(station => {
                    entityStation.addSample( new Period(station.startDatetime, station.endDatetime), station.info);
                })

                const newEntity = new Cesium.Entity({
                    id: getTrainEntityId(line, entity.trainNo),
                    position: entityPosition,
                    orientation: new Cesium.VelocityOrientationProperty(entityPosition),
                    model: {
                        uri: `./data/${line}.glb`,
                        scale: new Cesium.CallbackProperty(map.getSizeByZoom, false),
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                    },
                });

                newEntity.addProperty('station');
                //@ts-ignore
                newEntity.station = entityStation;
                datasource.entities.add(newEntity);
            });

            angleWorker.postMessage({ line, trains, railways });

        };

        trainWorker.postMessage({ line, trains, railways });
    }

}

const getTrainEntityId = (line: string, trainNo: string) => {
    return `${line}-${trainNo}`;
}
