
import * as Cesium from 'cesium';
// @ts-ignore
import {Cartesian3, Entity, Viewer, JulianDate} from '@types/cesium';
import trainColor from "../data/trainColor";

type FileList = {
    line: string,
    file: string
}
export default (viewer: Viewer) => {

    const fileList: FileList[] = [];
    for(let i = 1; i <= 8; i ++) {
        fileList.push({
            "line": `line${i}`,
            "file":`../dataTmp/railway_${i}.geojson`
        });
    }

    fileList
        .forEach((railway) => {
            const color = Cesium.Color.fromCssColorString(trainColor[railway.line]).withAlpha(0.5);
            viewer.dataSources.add(Cesium.GeoJsonDataSource.load(railway.file, {
                stroke: color,
                fill: color,
                strokeWidth: 4,
                clampToGround: true,
            }));
    });


}
