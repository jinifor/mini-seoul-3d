import trains, { trainsWorker } from './train';
// @ts-ignore
import {Viewer} from '@types/cesium';

import getSplitRailways from "../data/splitRailways";
import getTimetable from "../data/timetables";

import getRailways from "./railways";

export default (viewer: Viewer) => {
    async function main() {

        const [railwaysInfo, timetablesInfo] = await Promise.all([
            getSplitRailways(),
            getTimetable()
        ]);

        const dataSet = trains(railwaysInfo, timetablesInfo); // worker 생성
        dataSet.map(data => {
            trainsWorker(data);
        })
    }

    main();
    getRailways(viewer);
}

