const mongoose=require('mongoose');
const {Schema}=mongoose;

const projectSchema=new Schema({
    name:{
        type:String,
        required:true
    },
    githubLink:{
        type:String,
    },
    description:{
        type:String,
        required:true
    },
    indexedPaths:[
        {
            type:Object,
        }
    ],
    status:{
        type:String,
        enum:['pending','approved','rejected'],
        default:'pending'
    },
    user:{ type: Schema.Types.ObjectId, ref: 'User' }
},{ timestamps:true});

module.exports=mongoose.model('Project', projectSchema);