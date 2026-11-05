import type {DatabaseClient} from './database-client.ts';
import type {Json} from './database-schema.ts';
export type ChatActionBody={action:string;chat:string;message_id?:string;quoted_id?:string;values?:Record<string,Json|undefined>;state?:string;enabled?:boolean;resume_bot?:boolean;text?:string;value?:boolean;emoji?:string;base64?:string;type?:string;filename?:string;caption?:string;latitude?:number;longitude?:number;name?:string;address?:string;contact_phone?:string;question?:string;options?:string[];request_id?:string};
type ProviderData={Info?:{ID?:string};key?:{id?:string};id?:string;base64?:string;optionCounts?:Record<string,number>;totalVotes?:number};
export type ChatProviderReply=ProviderData&{data?:ProviderData};
export type ChatActionContext={db:DatabaseClient;owner:string;staff:string;body:ChatActionBody;provider:(db:DatabaseClient,owner:string,path:string,body?:unknown)=>Promise<ChatProviderReply>};
export type ChatSendPayload={number:string;quoted?:{messageId:string};text?:string|null;url?:string;type?:string|null;filename?:string;caption?:string;sticker?:string;latitude?:number;longitude?:number;name?:string;address?:string;vcard?:{fullName:string;phone:string};question?:string;options?:string[];maxAnswer?:number;id?:string};
