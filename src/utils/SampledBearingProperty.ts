import {Period} from "./datetime";

export type angle = {
    period: Period;
    value: number;
}

export class SampledBearingProperty {
    samples: angle[]

    constructor(samples?: angle[]) {
        this.samples = samples || [];
    }

    addSample(period: Period, value: number) {
        this.samples.push({
            period: period,
            value: value
        })
    }

    getValue(time: Date): number | null {
        const foundSample = this.samples.find(sample => sample.period.contains(time));
        return foundSample ? foundSample.value : null;
    }
}


