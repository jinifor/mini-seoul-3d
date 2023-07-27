import trains, { trainsWorker } from './train';
// @ts-ignore
import {Viewer} from '@types/cesium';

import getSplitRailways from "../data/splitRailways";
import getTimetable from "../data/timetables";

import getRailways from "./railways";

export default async (viewer: Viewer) =>
    new Promise((resolve, reject) => {
        async function main() {

            const [railwaysInfo, timetablesInfo] = await Promise.all([
                getSplitRailways(),
                getTimetable()
            ]);

            const dataSet = trains(railwaysInfo, timetablesInfo); // worker 생성
            trainsWorker(dataSet, resolve);
        }

        main();
        getRailways(viewer);
    });

