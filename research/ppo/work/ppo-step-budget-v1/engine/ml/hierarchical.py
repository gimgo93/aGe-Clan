"""Learned conditional action tree, with the original engine leaf-action IDs."""
import numpy as np
import torch
from torch import nn
from sb3_contrib.common.maskable.distributions import MaskableCategoricalDistribution
from sb3_contrib.common.maskable.policies import MaskableActorCriticPolicy

GROUPS=('wait','build','upgrade_repair','economy_research','combat','sell')
NAME_GROUP={'wait':0,'build':1,'upgradeCastle':2,'upgradeTower':2,'repairCastle':2,
            'hire':3,'hireWoodcutter':3,'buildLab':3,'researchPotion':3,
            'startWave':4,'potion':4,'sellTower':5}


def make_tree(actions):
    assert set(a['name'] for a in actions)==set(NAME_GROUP)
    children=[]
    for group in range(6):
        ids=[i for i,a in enumerate(actions) if NAME_GROUP[a['name']]==group]
        if group==0:
            assert len(ids)==1
            children.append(ids[0])
        elif group==1:
            types=list(dict.fromkeys(actions[i]['args'][0] for i in ids))
            children.append([[i for i in ids if actions[i]['args'][0]==kind] for kind in types])
        else:
            children.append(ids)
    return children


class HierarchicalDistribution(MaskableCategoricalDistribution):
    """Independent learned logits at each internal node; exact joint leaf entropy.

    PPO sees leaf IDs. Each joint leaf log probability is the sum of the
    conditional log probabilities along its path. Sampling the joint distribution
    equals ancestral sampling; deterministic mode explicitly walks child argmaxes.
    """
    def __init__(self, actions):
        super().__init__(len(actions))
        self.tree=make_tree(actions)
        nodes=[];paths={}
        def visit(tree,path):
            if isinstance(tree,int):
                assert tree not in paths
                paths[tree]=path
                return
            index=len(nodes);nodes.append(tree)
            for child,subtree in enumerate(tree):visit(subtree,path+[(index,child)])
        visit(self.tree,[])
        assert sorted(paths)==list(range(len(actions)))
        self.node_count=len(nodes);self.width=max(map(len,nodes))
        self.logit_count=sum(map(len,nodes))
        padded=self.node_count*self.width
        mapping=np.zeros(padded,dtype=np.int64)
        descendants=np.zeros((padded,len(actions)),dtype=np.float32)
        offset=0
        for node,tree in enumerate(nodes):
            for child in range(len(tree)):
                mapping[node*self.width+child]=offset+child
            offset+=len(tree)
        depth=max(map(len,paths.values()))
        path_indices=np.zeros((len(actions),depth),dtype=np.int64)
        path_nodes=path_indices.copy();path_children=path_indices.copy()
        path_active=np.zeros((len(actions),depth),dtype=bool)
        for leaf,path in paths.items():
            for d,(node,child) in enumerate(path):
                index=node*self.width+child
                descendants[index,leaf]=1
                path_indices[leaf,d]=index
                path_nodes[leaf,d]=node;path_children[leaf,d]=child
                path_active[leaf,d]=True
        self._arrays=(mapping,descendants,path_indices,path_nodes,path_children,path_active)
        self._device=None

    def proba_distribution_net(self,latent_dim):
        return nn.Linear(latent_dim,self.logit_count)

    def proba_distribution(self,action_logits):
        self.raw_logits=action_logits.reshape(-1,self.logit_count)
        if self._device!=self.raw_logits.device:
            self.mapping,self.descendants,self.path_indices,self.path_nodes,self.path_children,self.path_active=[torch.as_tensor(a,device=self.raw_logits.device) for a in self._arrays]
            self._device=self.raw_logits.device
        self.apply_masking(None)
        return self

    def apply_masking(self,masks):
        batch=self.raw_logits.shape[0]
        mask=torch.ones((batch,self.action_dim),dtype=torch.bool,device=self.raw_logits.device) if masks is None else torch.as_tensor(masks,dtype=torch.bool,device=self.raw_logits.device).reshape(batch,self.action_dim)
        if not bool(mask.any(dim=1).all()):raise ValueError('No legal leaf action')
        legal=(mask.float()@self.descendants.T>0).reshape(batch,self.node_count,self.width)
        # Unreachable nodes receive a dummy local choice. Their incoming probability
        # is zero, so they add no mass, gradients or entropy to the joint policy.
        inactive=~legal.any(dim=-1)
        legal=legal.clone();legal[:,:,0]|=inactive
        logits=self.raw_logits[:,self.mapping].reshape(batch,self.node_count,self.width)
        conditional=torch.log_softmax(logits.masked_fill(~legal,-1e9),dim=-1)
        factors=conditional.flatten(1)[:,self.path_indices]
        joint=(factors*self.path_active).sum(dim=-1)
        self.distribution=torch.distributions.Categorical(logits=joint.masked_fill(~mask,-1e9))
        self.conditional=conditional;self.legal_leaves=mask

    def mode(self):
        choices=self.conditional.argmax(dim=-1)
        match=(choices[:,self.path_nodes]==self.path_children)|~self.path_active
        valid=match.all(dim=-1)&self.legal_leaves
        assert bool((valid.sum(dim=-1)==1).all())
        return valid.long().argmax(dim=-1)


class HierarchicalPolicy(MaskableActorCriticPolicy):
    def __init__(self,*args,action_table,**kwargs):
        self.action_table=action_table
        super().__init__(*args,**kwargs)

    def _build(self,lr_schedule):
        self.action_dist=HierarchicalDistribution(self.action_table)
        super()._build(lr_schedule)

    def _get_constructor_parameters(self):
        result=super()._get_constructor_parameters()
        result['action_table']=self.action_table
        return result
