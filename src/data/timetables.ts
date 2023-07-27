import {TimetablesInfo} from "./types";


export default async function(): Promise<TimetablesInfo[]> {

    const data = await fetch('dataTmp/timetable_weekday.json').then(res => res.json());

    return data;

}
