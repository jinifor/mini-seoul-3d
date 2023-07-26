
import * as Cesium from 'cesium';
// @ts-ignore
import {Cartesian3, Entity, Viewer, JulianDate} from '@types/cesium';
import trainColor from "../data/trainColor";

type FileList = {
    line: string,
    file: string
}
export default (viewer: Viewer) => {

    // const fileList: FileList[] = [];
    // for(let i = 1; i <= 8; i ++) {
    //     fileList.push({
    //         "line": `line${i}`,
    //         "file":`../dataTmp/railway_${i}.geojson`
    //     });
    // }

    [
        {   "line": "line1",
            "file":'../dataTmp/railway_1.geojson'
        },
        {   "line": "line2",
            "file":'../dataTmp/railway_2.geojson'
        },
        {   "line": "line3",
            "file":'../dataTmp/railway_3.geojson'
        },
        {   "line": "line4",
            "file":'../dataTmp/railway_4.geojson'
        },
        {   "line": "line5",
            "file":'../dataTmp/railway_5.geojson'
        },
        {   "line": "line6",
            "file":'../dataTmp/railway_6.geojson'
        },
        {   "line": "line7",
            "file":'../dataTmp/railway_7.geojson'
        },
        {   "line": "line8",
            "file":'../dataTmp/railway_8.geojson'
        },
    ]
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
