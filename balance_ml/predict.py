"""Inspect a saved learned surrogate without running games or retraining."""
import argparse
import json
from pathlib import Path
from .model import Surrogate


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model',default=str(Path(__file__).parent/'models/bootstrap/surrogate.npz'))
    parser.add_argument('--params-file',help='UTF-8 JSON object; omitted parameters keep baseline values')
    args=parser.parse_args()
    model=Surrogate.load(args.model)
    params=json.loads(Path(args.params_file).read_text(encoding='utf-8-sig')) if args.params_file else {}
    for key,value in params.items():
        s=model.schema.get(key)
        if not s or type(value) not in (float,int) or not s['min']<=value<=s['max'] or (s.get('integer') and int(value)!=value):
            parser.error('Parameter outside model schema: '+key)
    print(json.dumps({'prediction_only':True,'holdout_metrics':model.metrics,
                      'predicted_waves':{p:{'mean':model.predict(params,p)[0],'ensemble_spread':model.predict(params,p)[1]} for p in model.policies}},indent=2))


if __name__=='__main__':main()
