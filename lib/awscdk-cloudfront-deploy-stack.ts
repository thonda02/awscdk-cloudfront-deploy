import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as iam from '@aws-cdk/aws-iam';

export class AwscdkCloudfrontDeployStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // cdk.jsonからbucketNameを取得
    const bucketName: string = this.node.tryGetContext('s3').bucketName;
    // bucketを新規作成
    const bucket = new s3.Bucket(this, 'S3Bucket', {
      bucketName: bucketName,
      // Bucketへの直接アクセスを禁止
      accessControl: s3.BucketAccessControl.PRIVATE,
      // CDK Stack削除時にBucketも削除する
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
    });

    // S3 を公開状態にすることなく、S3 へのアクセスを CloudFront からのリクエストに絞る為の仕組み
    const identity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {
      comment: `${bucket.bucketName} access identity`,
    });

    // principalsに設定したアクセス元からのみに S3 バケットのGetObject権限を渡す
    // ポリシーを設定することで、S3 バケットのオブジェクトは CloudFront を介してのみアクセスできる
    const bucketPolicyStatement = new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      effect: iam.Effect.ALLOW,
      principals: [identity.grantPrincipal],
      resources: [`${bucket.bucketArn}/*`],
    });
    // bucketにポリシーをアタッチ
    bucket.addToResourcePolicy(bucketPolicyStatement);
    // CloudFrontのdistribution作成
    new cloudfront.CloudFrontWebDistribution(this, 'WebDistribution', {
      enableIpV6: true,
      httpVersion: cloudfront.HttpVersion.HTTP2,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: bucket,
            originAccessIdentity: identity,
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD,
              cachedMethods: cloudfront.CloudFrontAllowedCachedMethods.GET_HEAD,
              forwardedValues: {
                queryString: false,
              },
            },
          ],
        },
      ],
      // 403/404エラーはindex.htmlを表示
      errorConfigurations: [
        {
          errorCode: 403,
          responseCode: 200,
          errorCachingMinTtl: 0,
          responsePagePath: '/index.html',
        },
        {
          errorCode: 404,
          responseCode: 200,
          errorCachingMinTtl: 0,
          responsePagePath: '/index.html',
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });
  }
}
